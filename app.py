import eventlet
eventlet.monkey_patch()

from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, join_room, leave_room, emit

app = Flask(__name__, static_folder='static', static_url_path='')
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

rooms = {} # pin -> [sid1, sid2]

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@socketio.on('join')
def on_join(data):
    pin = data['pin']
    sid = data['sid']

    if pin not in rooms:
        rooms[pin] = []
    
    if len(rooms[pin]) >= 2:
        emit('join_error', {'message': 'Room full'}, to=sid)
        return

    rooms[pin].append(sid)
    join_room(pin)
    
    emit('join_success', {'message': f'Joined room {pin}', 'is_initiator': len(rooms[pin]) == 1}, to=sid)
    
    if len(rooms[pin]) == 2:
        # Notify the first person that the second person joined
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
