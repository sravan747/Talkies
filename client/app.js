const BACKEND_URL=
    (location.hostname==="localhost"||location.hostname==="127.0.0.1")&&location.port==="5500"
        ?"http://localhost:3000"
        :location.origin;

const socket=io(BACKEND_URL);

let currentRoomId=null;
let currentRoomState=null;
let currentRole="listener";
let isHost=false;
let userName=localStorage.getItem("talkiesName")||"";
let localStream=null;
let isMicMuted=false;
let selectedVisibility="public";
let pendingAction=null;

const peers=new Map();

const homeScreen=document.querySelector("#homeScreen");
const roomScreen=document.querySelector("#roomScreen");
const roomsList=document.querySelector("#roomsList");

const roomNameInput=document.querySelector("#roomName");
const joinRoomInput=document.querySelector("#joinRoomId");

const openCreateButton=document.querySelector("#openCreate");
const createButton=document.querySelector("#createRoom");
const closeCreateButton=document.querySelector("#closeCreateModal");

const refreshRoomsButton=document.querySelector("#refreshRooms");
const focusJoinButton=document.querySelector("#focusJoin");
const joinButton=document.querySelector("#joinRoom");

const nameModal=document.querySelector("#nameModal");
const nameInput=document.querySelector("#nameInput");
const saveNameButton=document.querySelector("#saveName");
const closeNameModal=document.querySelector("#closeNameModal");

const visibilityOptions=document.querySelectorAll(
    ".visibility-option"
);

const roomTitle=document.querySelector("#roomTitle");
const roomVisibilityLabel=document.querySelector(
    "#roomVisibilityLabel"
);
const participantCount=document.querySelector(
    "#participantCount"
);
const roomLiveCount=document.querySelector(
    "#roomLiveCount"
);
const roomRole=document.querySelector("#roomRole");

const speakers=document.querySelector("#speakers");
const requestSpeakButton=document.querySelector(
    "#requestSpeak"
);
const micButton=document.querySelector("#micButton");
const micStatus=document.querySelector("#micStatus");

const inviteLink=document.querySelector("#inviteLink");
const copyInviteButton=document.querySelector(
    "#copyInvite"
);

const hostPanel=document.querySelector("#hostPanel");
const requests=document.querySelector("#requests");
const endRoomButton=document.querySelector("#endRoom");
const leaveButton=document.querySelector("#leaveRoom");

const chatInput=document.querySelector("#chatInput");
const sendMessageButton=document.querySelector(
    "#sendMessage"
);
const chatMessages=document.querySelector(
    "#chatMessages"
);

const remoteAudio=document.querySelector(
    "#remoteAudio"
);

const toastContainer=document.querySelector(
    "#toastContainer"
);

const createModal=document.querySelector(
    "#createModal"
);

socket.on("connect",()=>{
    console.log(
        "Connected to Talkies server:",
        socket.id
    );

    loadRooms();

    if(userName){
        socket.emit("set-name",userName);
    }
});

socket.on("connect_error",error=>{
    console.error(
        "Socket connection failed:",
        error
    );

    showToast(
        "Connection problem",
        "Could not connect to the Talkies server."
    );
});

setTimeout(()=>{
    const intro=document.querySelector("#intro");

    intro.style.opacity="0";
    intro.style.visibility="hidden";

    setTimeout(()=>{
        intro.style.display="none";
    },600);
},2600);

function showToast(title,message=""){
    const toast=document.createElement("div");

    toast.className="toast";

    const strong=document.createElement("strong");

    strong.textContent=title;

    toast.appendChild(strong);

    if(message){
        const text=document.createElement("div");

        text.textContent=message;

        toast.appendChild(text);
    }

    toastContainer.appendChild(toast);

    setTimeout(()=>{
        toast.classList.add("out");

        setTimeout(()=>{
            toast.remove();
        },300);
    },3000);
}

function openModal(modal){
    modal.classList.add("show");
}

function closeModal(modal){
    modal.classList.remove("show");
}

function askName(action){
    if(userName){
        action();
        return;
    }

    pendingAction=action;

    openModal(nameModal);

    setTimeout(()=>{
        nameInput.focus();
    },100);
}

function saveName(){
    const name=nameInput.value.trim();

    if(!name){
        nameInput.focus();
        return;
    }

    userName=name.substring(0,30);

    localStorage.setItem(
        "talkiesName",
        userName
    );

    socket.emit(
        "set-name",
        userName
    );

    closeModal(nameModal);

    if(pendingAction){
        const action=pendingAction;

        pendingAction=null;

        action();
    }
}

function createInviteLink(roomId){
    return`${window.location.origin}${window.location.pathname}?room=${roomId}`;
}

async function loadRooms(){
    try{
        const response=await fetch(`${BACKEND_URL}/rooms`)

        const rooms=await response.json();

        renderRooms(rooms);
    }catch(error){
        console.error(error);

        roomsList.innerHTML=
            '<div class="room-empty">Live rooms could not be loaded.</div>';
    }
}

function renderRooms(rooms){
    roomsList.innerHTML="";

    if(!rooms.length){
        roomsList.innerHTML=
            '<div class="room-empty">No conversations are live right now.</div>';

        return;
    }

    rooms.forEach((room,index)=>{
        const card=document.createElement("article");

        card.className="room-card";

        card.style.animationDelay=
            `${index*50}ms`;

        const top=document.createElement("div");

        top.className="room-topline";

        const live=document.createElement("div");

        live.className="room-status";

        const dot=document.createElement("span");

        dot.className="live-dot";

        live.appendChild(dot);

        live.appendChild(
            document.createTextNode("LIVE")
        );

        const type=document.createElement("div");

        type.className="room-type";

        type.textContent=
            room.visibility==="private"
                ?"PRIVATE"
                :"PUBLIC";

        top.appendChild(live);
        top.appendChild(type);

        const title=document.createElement("h3");

        title.textContent=room.name;

        const meta=document.createElement("div");

        meta.className="room-meta";

        const count=document.createElement("span");

        count.textContent=
            room.participantCount===1
                ?"1 person"
                :`${room.participantCount} people`;

        meta.appendChild(count);

        const button=document.createElement("button");

        button.className="button secondary";

        button.textContent=
            room.visibility==="private"
                ?"Request to join"
                :"Join room";

        button.addEventListener(
            "click",
            ()=>{
                askName(()=>{
                    if(room.visibility==="private"){
                        requestPrivateRoom(
                            room.roomId
                        );
                    }else{
                        joinPublicRoom(
                            room.roomId
                        );
                    }
                });
            }
        );

        card.appendChild(top);
        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(button);

        roomsList.appendChild(card);
    });
}

async function createRoom(){
    const name=roomNameInput.value.trim();

    if(!name){
        roomNameInput.focus();
        return;
    }

    if(!userName){
        closeModal(createModal);

        askName(()=>{
            openModal(createModal);

            setTimeout(()=>{
                roomNameInput.focus();
            },100);
        });

        return;
    }

    try{
        const response=await fetch(`${BACKEND_URL}/rooms`,
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    roomName:name,
                    visibility:selectedVisibility
                })
            }
        );

        const data=await response.json();

        if(!response.ok){
            showToast(
                "Could not create room",
                data.message
            );

            return;
        }

        roomNameInput.value="";

        closeModal(createModal);

        if(selectedVisibility==="private"){
            openPrivateRoom(
                data.roomId,
                data.roomName
            );
        }else{
            openPublicRoom(
                data.roomId,
                data.roomName
            );
        }

    }catch(error){
        console.error(error);

        showToast(
            "Connection problem",
            "Could not create the room."
        );
    }
}

async function joinPublicRoom(roomId){
    try{
        const response=await fetch(`${BACKEND_URL}/rooms/join`,
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    roomId
                })
            }
        );

        const data=await response.json();

        if(!response.ok){
            showToast(
                "Room unavailable",
                data.message
            );

            return;
        }

        if(data.visibility==="private"){
            requestPrivateRoom(roomId);
            return;
        }

        openPublicRoom(
            data.roomId,
            data.roomName
        );

    }catch(error){
        console.error(error);

        showToast(
            "Connection problem",
            "Could not join the room."
        );
    }
}

function requestPrivateRoom(roomId){
    socket.emit(
        "request-join",
        {
            roomId,
            name:userName
        }
    );
}

function requestRoomById(){
    const roomId=
        joinRoomInput.value
            .trim()
            .toUpperCase();

    if(!roomId){
        joinRoomInput.focus();
        return;
    }

    askName(()=>{
        joinRoomById(roomId);
    });
}

async function joinRoomById(roomId){
    try{
        const response=await fetch(
            `${BACKEND_URL}/rooms/join`,
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    roomId
                })
            }
        );

        const data=await response.json();

        if(!response.ok){
            showToast(
                "Room unavailable",
                data.message
            );

            return;
        }

        if(data.visibility==="private"){
            requestPrivateRoom(roomId);

            return;
        }

        openPublicRoom(
            data.roomId,
            data.roomName
        );

    }catch(error){
        console.error(error);

        showToast(
            "Connection problem",
            "Could not join the room."
        );
    }
}

function openPublicRoom(roomId,name){
    currentRoomId=roomId;
    currentRole="listener";
    isHost=false;

    homeScreen.style.display="none";
    roomScreen.style.display="block";

    roomTitle.textContent=name;

    roomVisibilityLabel.textContent=
        "PUBLIC ROOM";

    roomRole.textContent="Listener";

    inviteLink.value=
        createInviteLink(roomId);

    resetChat();

    socket.emit(
        "set-name",
        userName
    );

    socket.emit(
        "join-room",
        {
            roomId,
            name:userName
        }
    );

    window.scrollTo({
        top:0,
        behavior:"smooth"
    });
}

function openPrivateRoom(roomId,name){
    currentRoomId=roomId;
    currentRole="speaker";
    isHost=true;

    homeScreen.style.display="none";
    roomScreen.style.display="block";

    roomTitle.textContent=name;

    roomVisibilityLabel.textContent=
        "PRIVATE ROOM";

    roomRole.textContent="Host";

    inviteLink.value=
        createInviteLink(roomId);

    resetChat();

    socket.emit(
        "set-name",
        userName
    );

    socket.emit(
        "join-room",
        {
            roomId,
            name:userName
        }
    );

    window.scrollTo({
        top:0,
        behavior:"smooth"
    });
}

function updateRoomHeader(){
    if(!currentRoomState){
        return;
    }

    const count=
        currentRoomState.participants.length;

    participantCount.textContent=
        count===1
            ?"1 participant"
            :`${count} participants`;

    roomLiveCount.textContent=
        count>0
            ?"LIVE"
            :"EMPTY";

    const me=
        currentRoomState.participants.find(
            user=>user.id===socket.id
        );

    if(me){
        currentRole=me.role;
        isHost=me.isHost;
    }

    if(isHost){
        roomRole.textContent="Host";

        hostPanel.style.display="block";
    }else if(currentRole==="speaker"){
        roomRole.textContent="Speaker";

        hostPanel.style.display="none";
    }else{
        roomRole.textContent="Listener";

        hostPanel.style.display="none";
    }

    requestSpeakButton.style.display=
        currentRole==="speaker"
            ?"none"
            :"inline-block";

    micButton.style.display=
        currentRole==="speaker"
            ?"inline-block"
            :"none";

    if(currentRole==="speaker"){
        ensureMicrophone();
    }

    renderParticipants();
}

function renderParticipants(){
    speakers.innerHTML="";

    if(
        !currentRoomState||
        !currentRoomState.participants.length
    ){
        speakers.innerHTML=
            '<div class="room-empty">No participants.</div>';

        return;
    }

    currentRoomState.participants.forEach(
        user=>{
            const person=document.createElement(
                "div"
            );

            person.className="person";

            const info=document.createElement(
                "div"
            );

            const name=document.createElement(
                "div"
            );

            name.className="person-name";

            name.textContent=
                user.name+
                (
                    user.id===socket.id
                        ?" (you)"
                        :""
                );

            const role=document.createElement(
                "div"
            );

            role.className="person-role";

            if(user.isHost){
                role.textContent=
                    "Host · Speaker";
            }else if(
                user.role==="speaker"
            ){
                role.textContent=
                    user.muted
                        ?"Speaker · Muted"
                        :"Speaker";
            }else{
                role.textContent=
                    "Listener";
            }

            info.appendChild(name);
            info.appendChild(role);

            person.appendChild(info);

            if(
                isHost&&
                user.id!==socket.id
            ){
                const actions=
                    document.createElement(
                        "div"
                    );

                actions.className=
                    "person-actions";

                if(user.role==="speaker"){
                    const mute=
                        document.createElement(
                            "button"
                        );

                    mute.className=
                        "small-button";

                    mute.textContent=
                        user.muted
                            ?"Unmute"
                            :"Mute";

                    mute.addEventListener(
                        "click",
                        ()=>{
                            if(user.muted){
                                socket.emit(
                                    "unmute-participant",
                                    {
                                        targetId:user.id
                                    }
                                );
                            }else{
                                socket.emit(
                                    "mute-participant",
                                    {
                                        targetId:user.id
                                    }
                                );
                            }
                        }
                    );

                    actions.appendChild(mute);
                }

                const remove=
                    document.createElement(
                        "button"
                    );

                remove.className=
                    "small-button";

                remove.textContent=
                    "Remove";

                remove.addEventListener(
                    "click",
                    ()=>{
                        socket.emit(
                            "remove-participant",
                            {
                                targetId:user.id
                            }
                        );
                    }
                );

                actions.appendChild(remove);

                person.appendChild(actions);
            }

            speakers.appendChild(person);
        }
    );
}

function renderRequests(){
    requests.innerHTML="";

    if(!isHost){
        return;
    }

    const empty=document.createElement(
        "div"
    );

    empty.className="room-empty";

    empty.textContent=
        "No pending requests.";

    requests.appendChild(empty);
}

function addJoinRequest(request){
    if(!isHost){
        return;
    }

    const existing=document.querySelector(
        `[data-request-id="${request.id}"]`
    );

    if(existing){
        return;
    }

    const item=document.createElement(
        "div"
    );

    item.className="request";

    item.dataset.requestId=
        request.id;

    const text=document.createElement(
        "div"
    );

    text.textContent=
        request.name+
        " wants to join.";

    const actions=
        document.createElement("div");

    actions.className=
        "request-actions";

    const approve=
        document.createElement(
            "button"
        );

    approve.className=
        "small-button";

    approve.textContent=
        "Accept";

    approve.addEventListener(
        "click",
        ()=>{
            socket.emit(
                "approve-join",
                {
                    requestId:request.id
                }
            );

            item.remove();
        }
    );

    const reject=
        document.createElement(
            "button"
        );

    reject.className=
        "small-button";

    reject.textContent=
        "Reject";

    reject.addEventListener(
        "click",
        ()=>{
            socket.emit(
                "reject-join",
                {
                    requestId:request.id
                }
            );

            item.remove();
        }
    );

    actions.appendChild(approve);
    actions.appendChild(reject);

    item.appendChild(text);
    item.appendChild(actions);

    requests.appendChild(item);
}

function addSpeakRequest(request){
    if(!isHost){
        return;
    }

    const existing=document.querySelector(
        `[data-speak-id="${request.id}"]`
    );

    if(existing){
        return;
    }

    const item=document.createElement(
        "div"
    );

    item.className="request";

    item.dataset.speakId=
        request.id;

    const text=document.createElement(
        "div"
    );

    text.textContent=
        request.name+
        " wants to speak.";

    const actions=
        document.createElement("div");

    actions.className=
        "request-actions";

    const approve=
        document.createElement(
            "button"
        );

    approve.className=
        "small-button";

    approve.textContent=
        "Allow";

    approve.addEventListener(
        "click",
        ()=>{
            socket.emit(
                "approve-speak",
                {
                    targetId:request.id
                }
            );

            item.remove();
        }
    );

    const reject=
        document.createElement(
            "button"
        );

    reject.className=
        "small-button";

    reject.textContent=
        "Reject";

    reject.addEventListener(
        "click",
        ()=>{
            socket.emit(
                "reject-speak",
                {
                    targetId:request.id
                }
            );

            item.remove();
        }
    );

    actions.appendChild(approve);
    actions.appendChild(reject);

    item.appendChild(text);
    item.appendChild(actions);

    requests.appendChild(item);
}

function resetChat(){
    chatMessages.innerHTML="";
}

function addChatMessage(data){
    const message=document.createElement(
        "div"
    );

    message.className=
        "chat-message";

    const name=document.createElement(
        "div"
    );

    name.className=
        "chat-name";

    name.textContent=
        data.name;

    const text=document.createElement(
        "div"
    );

    text.className=
        "chat-text";

    text.textContent=
        data.message;

    const time=document.createElement(
        "div"
    );

    time.className=
        "chat-time";

    time.textContent=
        data.time;

    message.appendChild(name);
    message.appendChild(text);
    message.appendChild(time);

    chatMessages.appendChild(
        message
    );

    chatMessages.scrollTop=
        chatMessages.scrollHeight;
}

function sendMessage(){
    const message=
        chatInput.value.trim();

    if(
        !message||
        !currentRoomId
    ){
        return;
    }

    socket.emit(
        "send-message",
        message
    );

    chatInput.value="";
}

async function ensureMicrophone(){
    if(localStream){
        return;
    }

    if(
        !navigator.mediaDevices||
        !navigator.mediaDevices.getUserMedia
    ){
        micStatus.textContent=
            "Microphone access is not available here.";

        return;
    }

    try{
        localStream=
            await navigator.mediaDevices
                .getUserMedia({
                    audio:true,
                    video:false
                });

        localStream
            .getAudioTracks()
            .forEach(track=>{
                track.enabled=
                    !isMicMuted;
            });

        micStatus.textContent=
            "Microphone is ready.";

        await rebuildPeers();

    }catch(error){
        console.error(
            "Microphone error:",
            error
        );

        micStatus.textContent=
            "Microphone permission was not granted.";

        showToast(
            "Microphone unavailable",
            "Allow microphone access to speak."
        );
    }
}

function toggleMicrophone(){
    if(!localStream){
        ensureMicrophone();

        return;
    }

    isMicMuted=
        !isMicMuted;

    localStream
        .getAudioTracks()
        .forEach(track=>{
            track.enabled=
                !isMicMuted;
        });

    micButton.textContent=
        isMicMuted
            ?"Unmute microphone"
            :"Mute microphone";

    micStatus.textContent=
        isMicMuted
            ?"Microphone muted."
            :"Microphone is active.";
}

function closePeer(peerId){
    const pc=peers.get(peerId);

    if(pc){
        pc.close();

        peers.delete(peerId);
    }
}

function closeAllPeers(){
    peers.forEach(pc=>{
        pc.close();
    });

    peers.clear();
}

function shouldConnectTo(user){
    if(user.id===socket.id){
        return false;
    }

    return(
        currentRole==="speaker"||
        user.role==="speaker"
    );
}

async function rebuildPeers(){
    if(!currentRoomState){
        return;
    }

    const validIds=
        new Set(
            currentRoomState
                .participants
                .filter(
                    user=>shouldConnectTo(user)
                )
                .map(
                    user=>user.id
                )
        );

    [
        ...peers.keys()
    ].forEach(id=>{
        if(!validIds.has(id)){
            closePeer(id);
        }
    });

    for(
        const user
        of currentRoomState.participants
    ){
        if(!shouldConnectTo(user)){
            continue;
        }

        if(peers.has(user.id)){
            continue;
        }

        await createPeer(user);
    }
}

function createPeer(user){
    return new Promise(
        async resolve=>{
            const pc=
                new RTCPeerConnection({
                    iceServers:[
                        {
                            urls:
                                "stun:stun.l.google.com:19302"
                        }
                    ]
                });

            peers.set(
                user.id,
                pc
            );

            pc.onicecandidate=
                event=>{
                    if(event.candidate){
                        socket.emit(
                            "webrtc-ice",
                            {
                                target:user.id,
                                candidate:
                                    event.candidate
                            }
                        );
                    }
                };

            pc.ontrack=
                event=>{
                    if(
                        event.streams&&
                        event.streams[0]
                    ){
                        remoteAudio.srcObject=
                            event.streams[0];

                        remoteAudio
                            .play()
                            .catch(
                                ()=>{}
                            );
                    }
                };

            pc.onconnectionstatechange=
                ()=>{
                    if(
                        pc.connectionState===
                            "failed"||
                        pc.connectionState===
                            "closed"
                    ){
                        closePeer(
                            user.id
                        );
                    }
                };

            if(
                currentRole==="speaker"&&
                localStream
            ){
                localStream
                    .getTracks()
                    .forEach(
                        track=>{
                            pc.addTrack(
                                track,
                                localStream
                            );
                        }
                    );
            }else{
                pc.addTransceiver(
                    "audio",
                    {
                        direction:
                            "recvonly"
                    }
                );
            }

            const shouldOffer=
                socket.id<
                user.id;

            if(shouldOffer){
                try{
                    const offer=
                        await pc.createOffer();

                    await pc.setLocalDescription(
                        offer
                    );

                    socket.emit(
                        "webrtc-offer",
                        {
                            target:user.id,
                            offer:
                                pc.localDescription
                        }
                    );
                }catch(error){
                    console.error(
                        "Offer error:",
                        error
                    );
                }
            }

            resolve();
        }
    );
}

async function handleOffer(data){
    let pc=peers.get(
        data.from
    );

    if(!pc){
        const user=
            currentRoomState
                ?.participants
                .find(
                    participant=>
                        participant.id===
                        data.from
                );

        if(!user){
            return;
        }

        pc=
            new RTCPeerConnection({
                iceServers:[
                    {
                        urls:
                            "stun:stun.l.google.com:19302"
                    }
                ]
            });

        peers.set(
            data.from,
            pc
        );

        pc.onicecandidate=
            event=>{
                if(event.candidate){
                    socket.emit(
                        "webrtc-ice",
                        {
                            target:data.from,
                            candidate:
                                event.candidate
                        }
                    );
                }
            };

        pc.ontrack=
            event=>{
                if(
                    event.streams&&
                    event.streams[0]
                ){
                    remoteAudio.srcObject=
                        event.streams[0];

                    remoteAudio
                        .play()
                        .catch(
                            ()=>{}
                        );
                }
            };

        pc.onconnectionstatechange=
            ()=>{
                if(
                    pc.connectionState===
                        "failed"||
                    pc.connectionState===
                        "closed"
                ){
                    closePeer(
                        data.from
                    );
                }
            };

        if(
            currentRole==="speaker"&&
            localStream
        ){
            localStream
                .getTracks()
                .forEach(
                    track=>{
                        pc.addTrack(
                            track,
                            localStream
                        );
                    }
                );
        }else{
            pc.addTransceiver(
                "audio",
                {
                    direction:
                        "recvonly"
                }
            );
        }
    }

    try{
        await pc.setRemoteDescription(
            data.offer
        );

        const answer=
            await pc.createAnswer();

        await pc.setLocalDescription(
            answer
        );

        socket.emit(
            "webrtc-answer",
            {
                target:data.from,
                answer:
                    pc.localDescription
            }
        );

    }catch(error){
        console.error(
            "Offer handling error:",
            error
        );
    }
}

async function handleAnswer(data){
    const pc=
        peers.get(
            data.from
        );

    if(!pc){
        return;
    }

    try{
        await pc.setRemoteDescription(
            data.answer
        );
    }catch(error){
        console.error(
            "Answer error:",
            error
        );
    }
}

async function handleIce(data){
    const pc=
        peers.get(
            data.from
        );

    if(!pc){
        return;
    }

    try{
        await pc.addIceCandidate(
            data.candidate
        );
    }catch(error){
        console.error(
            "ICE error:",
            error
        );
    }
}

function leaveRoom(){
    if(currentRoomId){
        socket.emit(
            "leave-room"
        );
    }

    cleanupRoom();
}

function cleanupRoom(){
    closeAllPeers();

    if(localStream){
        localStream
            .getTracks()
            .forEach(
                track=>{
                    track.stop();
                }
            );

        localStream=null;
    }

    currentRoomId=null;
    currentRoomState=null;
    currentRole="listener";
    isHost=false;
    isMicMuted=false;

    roomScreen.style.display="none";
    homeScreen.style.display="block";

    micButton.textContent=
        "Mute microphone";

    micStatus.textContent="";

    requests.innerHTML="";

    loadRooms();

    window.scrollTo({
        top:0,
        behavior:"smooth"
    });
}

function endRoom(){
    if(!isHost){
        return;
    }

    showToast(
        "Ending room",
        "The conversation will close for everyone."
    );

    socket.emit(
        "end-room"
    );
}

function copyInvite(){
    if(!inviteLink.value){
        return;
    }

    navigator.clipboard
        .writeText(
            inviteLink.value
        )
        .then(()=>{
            copyInviteButton.textContent=
                "Copied";

            showToast(
                "Invite copied",
                "Share the room link with your friends."
            );

            setTimeout(()=>{
                copyInviteButton.textContent=
                    "Copy";
            },1500);
        })
        .catch(()=>{
            inviteLink.select();

            document.execCommand(
                "copy"
            );

            copyInviteButton.textContent=
                "Copied";

            setTimeout(()=>{
                copyInviteButton.textContent=
                    "Copy";
            },1500);
        });
}

socket.on(
    "room-state",
    state=>{
        if(
            !currentRoomId||
            state.roomId!==currentRoomId
        ){
            return;
        }

        currentRoomState=state;

        updateRoomHeader();

        rebuildPeers();
    }
);

socket.on(
    "joined-room",
    data=>{
        currentRoomId=
            data.roomId;

        currentRole=
            data.role;

        isHost=
            data.isHost;

        roomRole.textContent=
            isHost
                ?"Host"
                :currentRole==="speaker"
                    ?"Speaker"
                    :"Listener";

        if(
            isHost||
            currentRole==="speaker"
        ){
            ensureMicrophone();
        }
    }
);

socket.on(
    "join-approved",
    data=>{
        currentRoomId=
            data.roomId;

        currentRole=
            data.role;

        isHost=false;

        homeScreen.style.display=
            "none";

        roomScreen.style.display=
            "block";

        roomTitle.textContent=
            data.roomName;

        roomVisibilityLabel.textContent=
            "PRIVATE ROOM";

        roomRole.textContent=
            "Listener";

        inviteLink.value=
            createInviteLink(
                data.roomId
            );

        resetChat();

        showToast(
            "You're in",
            "The host approved your request."
        );
    }
);

socket.on(
    "join-rejected",
    message=>{
        showToast(
            "Request declined",
            message
        );
    }
);

socket.on(
    "request-sent",
    data=>{
        showToast(
            "Request sent",
            data.message
        );
    }
);

socket.on(
    "speak-request-sent",
    message=>{
        showToast(
            "Request sent",
            message
        );
    }
);

socket.on(
    "private-room",
    ()=>{
        showToast(
            "Private room",
            "Request access from the host to enter."
        );
    }
);

socket.on(
    "action-error",
    message=>{
        showToast(
            "Something went wrong",
            message
        );
    }
);

socket.on(
    "join-request",
    request=>{
        addJoinRequest(
            request
        );

        showToast(
            "New join request",
            `${request.name} wants to join.`
        );
    }
);

socket.on(
    "speak-request",
    request=>{
        addSpeakRequest(
            request
        );

        showToast(
            "Speaking request",
            `${request.name} wants to speak.`
        );
    }
);

socket.on(
    "speaker-approved",
    async()=>{
        currentRole=
            "speaker";

        showToast(
            "You can speak now",
            "The host approved your speaking request."
        );

        closeAllPeers();

        await ensureMicrophone();
    }
);

socket.on(
    "speaker-rejected",
    message=>{
        showToast(
            "Request declined",
            message
        );
    }
);

socket.on(
    "force-muted",
    ()=>{
        if(localStream){
            localStream
                .getAudioTracks()
                .forEach(
                    track=>{
                        track.enabled=
                            false;
                    }
                );
        }

        isMicMuted=true;

        micButton.textContent=
            "Unmute microphone";

        micStatus.textContent=
            "You were muted by the host.";

        showToast(
            "Microphone muted",
            "The host muted your microphone."
        );
    }
);

socket.on(
    "force-unmuted",
    ()=>{
        if(localStream){
            localStream
                .getAudioTracks()
                .forEach(
                    track=>{
                        track.enabled=
                            true;
                    }
                );
        }

        isMicMuted=false;

        micButton.textContent=
            "Mute microphone";

        micStatus.textContent=
            "Your microphone is active.";

        showToast(
            "Microphone unmuted",
            "Your microphone is active again."
        );
    }
);

socket.on(
    "removed-from-room",
    message=>{
        showToast(
            "Removed from room",
            message
        );

        cleanupRoom();
    }
);

socket.on(
    "room-ended",
    ()=>{
        showToast(
            "Room ended",
            "The host ended this conversation."
        );

        cleanupRoom();
    }
);

socket.on(
    "new-message",
    data=>{
        addChatMessage(
            data
        );
    }
);

socket.on(
    "participant-count",
    count=>{
        participantCount.textContent=
            count===1
                ?"1 participant"
                :`${count} participants`;

        roomLiveCount.textContent=
            count>0
                ?"LIVE"
                :"EMPTY";
    }
);

socket.on(
    "rooms-updated",
    ()=>{
        if(!currentRoomId){
            loadRooms();
        }
    }
);

socket.on(
    "webrtc-offer",
    handleOffer
);

socket.on(
    "webrtc-answer",
    handleAnswer
);

socket.on(
    "webrtc-ice",
    handleIce
);

openCreateButton.addEventListener(
    "click",
    ()=>{
        askName(()=>{
            openModal(
                createModal
            );

            setTimeout(()=>{
                roomNameInput.focus();
            },100);
        });
    }
);

closeCreateButton.addEventListener(
    "click",
    ()=>{
        closeModal(
            createModal
        );
    }
);

closeNameModal.addEventListener(
    "click",
    ()=>{
        closeModal(
            nameModal
        );

        pendingAction=null;
    }
);

saveNameButton.addEventListener(
    "click",
    saveName
);

nameInput.addEventListener(
    "keydown",
    event=>{
        if(event.key==="Enter"){
            saveName();
        }
    }
);

visibilityOptions.forEach(
    option=>{
        option.addEventListener(
            "click",
            ()=>{
                visibilityOptions.forEach(
                    item=>{
                        item.classList.remove(
                            "active"
                        );
                    }
                );

                option.classList.add(
                    "active"
                );

                selectedVisibility=
                    option.dataset.visibility;
            }
        );
    }
);

refreshRoomsButton.addEventListener(
    "click",
    loadRooms
);

focusJoinButton.addEventListener(
    "click",
    ()=>{
        document
            .querySelector("#joinSection")
            .scrollIntoView({
                behavior:"smooth"
            });

        setTimeout(()=>{
            joinRoomInput.focus();
        },500);
    }
);

joinButton.addEventListener(
    "click",
    requestRoomById
);

joinRoomInput.addEventListener(
    "keydown",
    event=>{
        if(event.key==="Enter"){
            requestRoomById();
        }
    }
);

createButton.addEventListener(
    "click",
    createRoom
);

sendMessageButton.addEventListener(
    "click",
    sendMessage
);

chatInput.addEventListener(
    "keydown",
    event=>{
        if(event.key==="Enter"){
            sendMessage();
        }
    }
);

leaveButton.addEventListener(
    "click",
    leaveRoom
);

endRoomButton.addEventListener(
    "click",
    endRoom
);

copyInviteButton.addEventListener(
    "click",
    copyInvite
);

micButton.addEventListener(
    "click",
    toggleMicrophone
);

requestSpeakButton.addEventListener(
    "click",
    ()=>{
        if(!currentRoomId){
            return;
        }

        socket.emit(
            "request-speak"
        );

        requestSpeakButton.disabled=true;

        setTimeout(()=>{
            requestSpeakButton.disabled=false;
        },2500);
    }
);

window.addEventListener(
    "beforeunload",
    ()=>{
        if(currentRoomId){
            socket.emit(
                "leave-room"
            );
        }
    }
);

const urlParams=
    new URLSearchParams(
        window.location.search
    );

const invitedRoom=
    urlParams.get("room");

if(invitedRoom){
    joinRoomInput.value=
        invitedRoom.toUpperCase();

    setTimeout(()=>{
        askName(()=>{
            joinRoomById(
                invitedRoom.toUpperCase()
            );
        });
    },2800);
}

loadRooms();