const socket = io();

const joinContainer = document.getElementById('join-container');
const videoContainer = document.getElementById('video-container');
const pinInput = document.getElementById('pin-input');
const joinBtn = document.getElementById('join-btn');
const errorMsg = document.getElementById('error-msg');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const cameraToggle = document.getElementById('camera-toggle');

let localStream;
let peerConnection;
let pin;
let isInitiator = false;
let currentFacingMode = 'user';

const configuration = {
    'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'}
    ]
};

joinBtn.addEventListener('click', () => {
    pin = pinInput.value.trim();
    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
        errorMsg.textContent = 'Please enter a valid 6-digit PIN.';
        return;
    }
    errorMsg.textContent = '';
    socket.emit('join', { pin: pin, sid: socket.id });
});

socket.on('join_error', (data) => {
    errorMsg.textContent = data.message;
});

socket.on('join_success', async (data) => {
    isInitiator = data.is_initiator;
    joinContainer.style.display = 'none';
    videoContainer.style.display = 'block';
    await startLocalStream();
});

socket.on('peer_joined', () => {
    if (isInitiator) {
        createPeerConnection();
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                socket.emit('signal', { pin: pin, signal: { 'sdp': peerConnection.localDescription } });
            });
    }
});

socket.on('signal', async (signal) => {
    if (!peerConnection) {
        createPeerConnection();
    }
    if (signal.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { pin: pin, signal: { 'sdp': peerConnection.localDescription } });
        }
    } else if (signal.ice) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice));
    }
});

socket.on('peer_disconnected', () => {
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    isInitiator = true; // Become initiator for the next person
});

async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode },
            audio: true
        });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Error accessing media devices.', err);
        alert('Camera/Microphone access denied or unavailable.');
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { pin: pin, signal: { 'ice': event.candidate } });
        }
    };
}

cameraToggle.addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    await startLocalStream();
    
    if (peerConnection) {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(videoTrack);
        }
    }
});