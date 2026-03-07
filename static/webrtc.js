const socket = io({
    transports: ['websocket', 'polling']
});

const joinContainer = document.getElementById('join-container');
const videoContainer = document.getElementById('video-container');
const pinInput = document.getElementById('pin-input');
const joinBtn = document.getElementById('join-btn');
const errorMsg = document.getElementById('error-msg');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const cameraToggle = document.getElementById('camera-toggle');
const muteBtn = document.getElementById('mute-btn');
const endCallBtn = document.getElementById('end-call-btn');

let localStream;
let peerConnection;
let pin;
let isInitiator = false;
let currentFacingMode = 'user';
let pendingCandidates = [];
let localStreamReady = false;
let isMuted = false;

const configuration = {
    'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
        {'urls': 'stun:stun1.l.google.com:19302'},
        {'urls': 'stun:stun2.l.google.com:19302'},
        {'urls': 'stun:stun3.l.google.com:19302'},
        {'urls': 'stun:stun4.l.google.com:19302'}
    ]
};

joinBtn.addEventListener('click', () => {
    pin = pinInput.value.trim();
    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
        errorMsg.textContent = 'Please enter a valid 6-digit PIN.';
        return;
    }
    errorMsg.textContent = '';
    socket.emit('join', { pin: pin });
});

socket.on('join_error', (data) => {
    errorMsg.textContent = data.message;
});

socket.on('join_success', async (data) => {
    isInitiator = data.is_initiator;
    joinContainer.style.display = 'none';
    videoContainer.style.display = 'block';
    await startLocalStream();
    localStreamReady = true;
    console.log('Local stream ready. Initiator:', isInitiator);
});

socket.on('peer_joined', async () => {
    console.log('Peer joined notification received.');
    // Wait for local stream if not ready
    while(!localStreamReady) await new Promise(r => setTimeout(r, 100));
    
    if (isInitiator) {
        console.log('Initiator creating offer...');
        await createPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { pin: pin, signal: { 'sdp': peerConnection.localDescription } });
    }
});

socket.on('signal', async (signal) => {
    // Wait for local stream before processing any signals
    while(!localStreamReady) await new Promise(r => setTimeout(r, 100));

    if (!peerConnection) {
        await createPeerConnection();
    }

    if (signal.sdp) {
        console.log('Received SDP:', signal.sdp.type);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { pin: pin, signal: { 'sdp': peerConnection.localDescription } });
        }
        
        while (pendingCandidates.length > 0) {
            const candidate = pendingCandidates.shift();
            await peerConnection.addIceCandidate(candidate).catch(e => console.error(e));
        }
    } else if (signal.ice) {
        const candidate = new RTCIceCandidate(signal.ice);
        if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(candidate).catch(e => console.error(e));
        } else {
            pendingCandidates.push(candidate);
        }
    }
});

socket.on('peer_disconnected', () => {
    console.log('Peer disconnected');
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    isInitiator = true; 
    pendingCandidates = [];
});

async function startLocalStream() {
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: currentFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: true
        });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Error accessing media devices.', err);
        alert('Camera error. Please ensure HTTPS is used and permissions are granted.');
    }
}

async function createPeerConnection() {
    if (peerConnection) return;
    
    console.log('Creating PeerConnection...');
    peerConnection = new RTCPeerConnection(configuration);
    
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        console.log('Remote track received:', event.track.kind);
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { pin: pin, signal: { 'ice': event.candidate } });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
    };
}

muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
    });
    muteBtn.classList.toggle('active', isMuted);
    muteBtn.innerHTML = isMuted ? '🔇' : '🎤';
});

endCallBtn.addEventListener('click', () => {
    window.location.reload();
});

cameraToggle.addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    await startLocalStream();
    
    if (peerConnection) {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(videoTrack);
        }
    }
});