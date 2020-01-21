importScripts("../js/comlink.js");

class MemoryPool {
	constructor(byteSize) {
		this._byteSize = byteSize;
		this._pool = [];
	}

	get() {
		if (this._pool.length <= 0) {
			return new ArrayBuffer(this._byteSize);
		}
		return this._pool.shift();
	}

	put(buffer) {
		if (ArrayBuffer.isView(buffer)) {
			buffer = buffer.buffer;
		}
		console.assert(
			buffer.byteSize !== this._byteSize,
			"Buffer has invalid size"
		);
		this._pool.push(buffer);
	}
}

class BallShooter {
	constructor({ numBalls, roomSize }) {
		this._numBalls = numBalls;
		this._roomSize = roomSize;
		this._pool = new MemoryPool(numBalls * 3 * Float32Array.BYTES_PER_ELEMENT);
		this.framerate = 90;
		this._positions = new Float32Array(this._pool.get());
		this._velocities = new Float32Array(this._pool.get());
		this._init();
	}

	_init() {
		for (var i = 0; i < this._numBalls; i++) {
			this._positions[i * 3 + 0] = random(
				-this._roomSize / 2 + 1,
				this._roomSize / 2 - 1
			);
			this._positions[i * 3 + 1] = random(0, this._roomSize);
			this._positions[i * 3 + 2] = random(
				-this._roomSize / 2 + 1,
				this._roomSize / 2 - 1
			);

			this._velocities[i * 3 + 0] = random(-0.005, 0.005);
			this._velocities[i * 3 + 1] = random(-0.005, 0.005);
			this._velocities[i * 3 + 2] = random(-0.005, 0.005);
		}
	}

	start() {
		this._lastFrame = performance.now();
		this._running = true;
		this._update();
	}

	getPositions() {
		const buffer = this._pool.get();
		new Float32Array(buffer).set(this._positions);
		return Comlink.transfer(buffer, [buffer]);
	}

	put(buffer) {
		this._pool.put(buffer);
	}

	_update() {
		const currentFrame = perforance.now();
		const nextFrame = currentFrame + 1000 / this.framerate;
		const delta = currentFrame - this._lastFrame;
		///
		console.log(delta);
		///
		this._lastFrame = currentFrame;
		if (this._running) {
			setTimeout(() => this._update(), nextFrame - performance.now());
		}
	}
}

function random(a, b) {
	return Math.random() * (b - a) + a;
}

Comlink.expose(BallShooter);
