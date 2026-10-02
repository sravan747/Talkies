const express=require("express");
const cors=require("cors");
const http=require("http");
const{Server}=require("socket.io");
const path=require("path");

const app=express();
const server=http.createServer(app);
app.use(express.static(path.join(__dirname,"../client")));

const io=new Server(server,{
    cors:{
        origin:"*"
    }
});

app.use(cors());
app.use(express.json());

const rooms={};

function createRoomId(){
    return"ROOM-"+Math.random().toString(36).substring(2,7).toUpperCase();
}

function getParticipantCount(roomId){
    const room=io.sockets.adapter.rooms.get(roomId);
    return room?room.size:0;
}

function getRoomState(roomId){
    const room=rooms[roomId];

    if(!room){
        return null;
    }

    const participants=Object.values(room.participants).map(user=>({
        id:user.id,
        name:user.name,
        role:user.role,
        muted:user.muted,
        isHost:user.id===room.hostId
    }));

    return{
        roomId,
        name:room.name,
        visibility:room.visibility,
        hostId:room.hostId,
        participants
    };
}

function sendRoomState(roomId){
    const state=getRoomState(roomId);

    if(!state){
        return;
    }

    io.to(roomId).emit("room-state",state);

    io.to(roomId).emit(
        "participant-count",
        state.participants.length
    );

    io.emit("rooms-updated");
}

function endRoom(roomId){
    const room=rooms[roomId];

    if(!room){
        return;
    }

    io.to(roomId).emit("room-ended");

    delete rooms[roomId];

    io.emit("rooms-updated");

    console.log("Room ended:",roomId);
}

app.get("/health",(request,response)=>{
    response.json({
        status:"ok",
        app:"Talkies"
    });
});

app.post("/rooms",(request,response)=>{
    const roomName=String(request.body.roomName||"").trim();
    const visibility=request.body.visibility;

    if(!roomName){
        return response.status(400).json({
            message:"Room name is required."
        });
    }

    if(roomName.length>80){
        return response.status(400).json({
            message:"Room name is too long."
        });
    }

    if(
        visibility!=="public"&&
        visibility!=="private"
    ){
        return response.status(400).json({
            message:"Invalid room visibility."
        });
    }

    const roomId=createRoomId();

    rooms[roomId]={
        name:roomName,
        visibility,
        hostId:null,
        participants:{},
        joinRequests:{},
        speakRequests:{}
    };

    console.log("Room created:",roomId);

    response.json({
        message:"Room created.",
        roomId,
        roomName,
        visibility
    });

    io.emit("rooms-updated");
});

app.get("/rooms",(request,response)=>{
    const liveRooms=Object.entries(rooms)
        .map(([roomId,room])=>{
            const participantCount=getParticipantCount(roomId);

            return{
                roomId,
                name:room.name,
                visibility:room.visibility,
                participantCount
            };
        })
        .filter(room=>room.participantCount>0);

    response.json(liveRooms);
});

app.post("/rooms/join",(request,response)=>{
    const roomId=String(request.body.roomId||"").trim();
    const room=rooms[roomId];

    if(!room){
        return response.status(404).json({
            message:"Room not found."
        });
    }

    if(room.visibility==="private"){
        return response.json({
            message:"This is a private room.",
            roomId,
            roomName:room.name,
            visibility:"private",
            requiresRequest:true
        });
    }

    response.json({
        message:"Room available.",
        roomId,
        roomName:room.name,
        visibility:"public",
        requiresRequest:false
    });
});

io.on("connection",socket=>{
    console.log("Connected:",socket.id);

    socket.on("set-name",name=>{
        const cleanName=String(name||"").trim();

        if(cleanName){
            socket.userName=cleanName.substring(0,30);
        }
    });

    socket.on("join-room",data=>{
        const roomId=data?.roomId;
        const room=rooms[roomId];

        if(!room){
            socket.emit("action-error","Room not found.");
            return;
        }

        /*
         * Public rooms:
         * anyone can directly join.
         *
         * Private rooms:
         * the first person becomes the host.
         * Later people must use request-join.
         */
        if(
            room.visibility==="private"&&
            room.hostId&&
            room.hostId!==socket.id
        ){
            socket.emit("private-room");
            return;
        }

        const name=String(
            data?.name||
            socket.userName||
            "Guest"
        ).trim();

        socket.userName=name.substring(0,30);

        socket.join(roomId);
        socket.roomId=roomId;

        const isFirstUser=!room.hostId;

        if(isFirstUser){
            room.hostId=socket.id;
        }

        room.participants[socket.id]={
            id:socket.id,
            name:socket.userName,
            role:isFirstUser?"speaker":"listener",
            muted:false
        };

        console.log(
            socket.userName,
            "joined",
            roomId
        );

        socket.emit("joined-room",{
            roomId,
            role:room.participants[socket.id].role,
            isHost:isFirstUser
        });

        sendRoomState(roomId);
    });

    socket.on("request-join",data=>{
        const roomId=data?.roomId;
        const room=rooms[roomId];

        if(!room){
            socket.emit("action-error","Room not found.");
            return;
        }

        if(room.visibility!=="private"){
            socket.emit(
                "action-error",
                "This room is public."
            );
            return;
        }

        if(!room.hostId){
            socket.emit(
                "action-error",
                "The room host is not connected."
            );
            return;
        }

        const name=String(
            data?.name||
            socket.userName||
            "Guest"
        ).trim();

        socket.userName=name.substring(0,30);

        room.joinRequests[socket.id]={
            id:socket.id,
            name:socket.userName
        };

        io.to(room.hostId).emit(
            "join-request",
            {
                id:socket.id,
                name:socket.userName
            }
        );

        socket.emit(
            "request-sent",
            {
                roomId,
                message:"Your request was sent to the host."
            }
        );
    });

    socket.on("approve-join",data=>{
        const roomId=socket.roomId;
        const room=rooms[roomId];
        const requestId=data?.requestId;

        if(!room||room.hostId!==socket.id){
            return;
        }

        const request=room.joinRequests[requestId];

        if(!request){
            return;
        }

        const target=io.sockets.sockets.get(requestId);

        if(!target){
            delete room.joinRequests[requestId];
            return;
        }

        delete room.joinRequests[requestId];

        target.join(roomId);
        target.roomId=roomId;

        room.participants[requestId]={
            id:requestId,
            name:request.name,
            role:"listener",
            muted:false
        };

        target.emit(
            "join-approved",
            {
                roomId,
                roomName:room.name,
                visibility:room.visibility,
                role:"listener",
                isHost:false
            }
        );

        sendRoomState(roomId);
    });

    socket.on("reject-join",data=>{
        const roomId=socket.roomId;
        const room=rooms[roomId];
        const requestId=data?.requestId;

        if(!room||room.hostId!==socket.id){
            return;
        }

        if(!room.joinRequests[requestId]){
            return;
        }

        delete room.joinRequests[requestId];

        const target=io.sockets.sockets.get(requestId);

        if(target){
            target.emit(
                "join-rejected",
                "The host rejected your request."
            );
        }
    });

    socket.on("request-speak",()=>{
        const roomId=socket.roomId;
        const room=rooms[roomId];

        if(!room){
            return;
        }

        const participant=room.participants[socket.id];

        if(!participant){
            return;
        }

        if(participant.role==="speaker"){
            return;
        }

        room.speakRequests[socket.id]={
            id:socket.id,
            name:socket.userName||"Guest"
        };

        io.to(room.hostId).emit(
            "speak-request",
            {
                id:socket.id,
                name:socket.userName||"Guest"
            }
        );

        socket.emit(
            "speak-request-sent",
            "Your request was sent to the host."
        );
    });

    socket.on("approve-speak",data=>{
        const roomId=socket.roomId;
        const room=rooms[roomId];
        const targetId=data?.targetId;

        if(!room||room.hostId!==socket.id){
            return;
        }

        const participant=room.participants[targetId];

        if(!participant){
            return;
        }

        participant.role="speaker";

        delete room.speakRequests[targetId];

        io.to(targetId).emit("speaker-approved");

        sendRoomState(roomId);
    });

    socket.on("reject-speak",data=>{
        const roomId=socket.roomId;
        const room=rooms[roomId];
        const targetId=data?.targetId;

        if(!room||room.hostId!==socket.id){
            return;
        }

        delete room.speakRequests[targetId];

        io.to(targetId).emit(
            "speaker-rejected",
            "The host did not approve your speaking request."
        );
    });

    socket.on("remove-participant",data=>{
        const roomId=socket.roomId;
        const room=rooms[roomId];
        const targetId=data?.targetId;

        if(!room||room.hostId!==socket.id){
            return;
        }

        if(targetId===socket.id){
            return;
        }

        const target=io.sockets.sockets.get(targetId);

        if(!target){
            return;
        }

        target.leave(roomId);

        delete room.participants[targetId];
        delete room.joinRequests[targetId];
        delete room.speakRequests[targetId];

        target.roomId=null;

        target.emit(
            "removed-from-room",
            "The host removed you from the room."
        );

        sendRoomState(roomId);
    });

    socket.on("mute-participant",data=>{
        const roomId=socket.roomId;
        const room=rooms[roomId];
        const targetId=data?.targetId;

        if(!room||room.hostId!==socket.id){
            return;
        }

        const participant=room.participants[targetId];

        if(!participant){
            return;
        }

        participant.muted=true;

        io.to(targetId).emit("force-muted");

        sendRoomState(roomId);
    });

    socket.on("unmute-participant",data=>{
        const roomId=socket.roomId;
        const room=rooms[roomId];
        const targetId=data?.targetId;

        if(!room||room.hostId!==socket.id){
            return;
        }

        const participant=room.participants[targetId];

        if(!participant){
            return;
        }

        participant.muted=false;

        io.to(targetId).emit("force-unmuted");

        sendRoomState(roomId);
    });

    socket.on("leave-room",()=>{
        const roomId=socket.roomId;

        if(!roomId){
            return;
        }

        const room=rooms[roomId];

        if(!room){
            socket.roomId=null;
            return;
        }

        if(room.hostId===socket.id){
            endRoom(roomId);
            socket.leave(roomId);
            socket.roomId=null;
            return;
        }

        socket.leave(roomId);

        delete room.participants[socket.id];
        delete room.joinRequests[socket.id];
        delete room.speakRequests[socket.id];

        socket.roomId=null;

        sendRoomState(roomId);
    });

    socket.on("end-room",()=>{
        const roomId=socket.roomId;
        const room=rooms[roomId];

        if(!room||room.hostId!==socket.id){
            return;
        }

        endRoom(roomId);
    });

    socket.on("send-message",message=>{
        const roomId=socket.roomId;

        if(!roomId||!rooms[roomId]){
            return;
        }

        const cleanMessage=String(message||"").trim();

        if(!cleanMessage){
            return;
        }

        if(cleanMessage.length>500){
            return;
        }

        io.to(roomId).emit(
            "new-message",
            {
                name:socket.userName||"Guest",
                message:cleanMessage,
                time:new Date().toLocaleTimeString(
                    [],
                    {
                        hour:"2-digit",
                        minute:"2-digit"
                    }
                )
            }
        );
    });

    socket.on("webrtc-offer",data=>{
        const roomId=socket.roomId;
        const targetId=data?.target;

        if(
            !roomId||
            !rooms[roomId]||
            !targetId
        ){
            return;
        }

        const target=io.sockets.sockets.get(targetId);

        if(
            !target||
            target.roomId!==roomId
        ){
            return;
        }

        target.emit(
            "webrtc-offer",
            {
                from:socket.id,
                offer:data.offer
            }
        );
    });

    socket.on("webrtc-answer",data=>{
        const roomId=socket.roomId;
        const targetId=data?.target;

        if(
            !roomId||
            !rooms[roomId]||
            !targetId
        ){
            return;
        }

        const target=io.sockets.sockets.get(targetId);

        if(
            !target||
            target.roomId!==roomId
        ){
            return;
        }

        target.emit(
            "webrtc-answer",
            {
                from:socket.id,
                answer:data.answer
            }
        );
    });

    socket.on("webrtc-ice",data=>{
        const roomId=socket.roomId;
        const targetId=data?.target;

        if(
            !roomId||
            !rooms[roomId]||
            !targetId
        ){
            return;
        }

        const target=io.sockets.sockets.get(targetId);

        if(
            !target||
            target.roomId!==roomId
        ){
            return;
        }

        target.emit(
            "webrtc-ice",
            {
                from:socket.id,
                candidate:data.candidate
            }
        );
    });

    socket.on("disconnect",()=>{
        console.log("Disconnected:",socket.id);

        const roomId=socket.roomId;

        if(!roomId){
            return;
        }

        const room=rooms[roomId];

        if(!room){
            return;
        }

        if(room.hostId===socket.id){
            endRoom(roomId);
            return;
        }

        delete room.participants[socket.id];
        delete room.joinRequests[socket.id];
        delete room.speakRequests[socket.id];

        sendRoomState(roomId);
    });
});

const PORT=process.env.PORT||3000;

server.listen(PORT,"0.0.0.0",()=>{
    console.log(`Talkies server running on port ${PORT}`);
});