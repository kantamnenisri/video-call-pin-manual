from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, join_room, leave_room, emit

app = Flask(__name__, static_folder='static', static_url_path='')
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

rooms = {} # pin -> [sid1, sid2]

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@socketio.on('join')
def on_join(data):
    pin = str(data.get('pin', ''))
    sid = request.sid

    if not pin or len(pin) != 6:
        emit('join_error', {'message': 'Invalid PIN format'}, to=sid)
        return

    # If room exists, check if it's full
    if pin in rooms:
        if len(rooms[pin]) >= 2:
            emit('join_error', {'message': 'Room full'}, to=sid)
            return
        # Second user joins existing room
        rooms[pin].append(sid)
        is_initiator = False
    else:
        # First user creates the room
        rooms[pin] = [sid]
        is_initiator = True
    
    join_room(pin)
    emit('join_success', {'message': f'Joined room {pin}', 'is_initiator': is_initiator}, to=sid)
    
    if len(rooms[pin]) == 2:
        # Notify the initiator that the peer has joined
        emit('peer_joined', {}, to=rooms[pin][0])

@socketio.on('signal')
def on_signal(data):
    pin = data['pin']
    emit('signal', data['signal'], room=pin, include_self=False)

@socketio.on('disconnect')
def on_disconnect():
    for pin, sids in list(rooms.items()):
        if request.sid in sids:
            sids.remove(request.sid)
            leave_room(pin)
            emit('peer_disconnected', {}, room=pin)
            if len(sids) == 0:
                del rooms[pin]

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=8000)
