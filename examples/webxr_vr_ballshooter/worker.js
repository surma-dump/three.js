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
	constructor({ numBalls, roomSize, radius, dampening }) {
		this._dampening = dampening;
		this._numBalls = numBalls;
		this._roomSize = roomSize;
		this._radius = radius;
		this._pool = new MemoryPool(numBalls * 3 * Float32Array.BYTES_PER_ELEMENT);
		this.framerate = 90;
		this._positions = new Float32Array(this._pool.get());
		this._velocities = new Float32Array(this._pool.get());
		this._init();
	}

	setCallback(cb) {
		this._cb = cb;
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
		const currentFrame = performance.now();
		const nextFrame = currentFrame + 1000 / this.framerate;
		const delta = currentFrame - this._lastFrame;
		///
		this._doPhysics(delta / 1000);
		const positions = this.getPositions();
		this._cb(Comlink.transfer(positions, [positions]));
		///
		this._lastFrame = currentFrame;
		if (this._running) {
			let deltaToNextFrame = nextFrame - performance.now();
			if (deltaToNextFrame < 0) {
				deltaToNextFrame = 0;
			}
			setTimeout(() => this._update(), deltaToNextFrame);
		}
	}

	_doPhysics(delta) {
		const range = this._roomSize / 2 - this._radius;
		const normal = new Float32Array(3);
		const relativeVelocity = new Float32Array(3);
		for (var i = 0; i < this._numBalls * 3; i += 3) {
			this._positions[i + 0] += this._velocities[i + 0] * delta;
			this._positions[i + 1] += this._velocities[i + 1] * delta;
			this._positions[i + 2] += this._velocities[i + 2] * delta;

			// Bounce of walls
			if (this._positions[i + 0] < -range || this._positions[i + 0] > range) {
				this._positions[i + 0] = clamp(this._positions[i + 0], -range, range);
				this._velocities[i + 0] = -this._velocities[i + 0] * this._dampening;
			}

			if (
				this._positions[i + 1] < this._radius ||
				this._positions[i + 1] > this._roomSize
			) {
				this._positions[i + 1] = Math.max(this._positions[i + 1], this._radius);

				this._velocities[i + 0] *= this._dampening;
				this._velocities[i + 1] = -this._velocities[i + 1] * this._dampening;
				this._velocities[i + 2] *= this._dampening;
			}

			if (this._positions[i + 2] < -range || this._positions[i + 2] > range) {
				this._positions[i + 2] = clamp(this._positions[i + 2], -range, range);
				this._velocities[i + 2] = -this._velocities[i + 2] * this._dampening;
			}

			// // Bounce of other balls
			for (var j = i + 3; j < this._numBalls * 3; j += 3) {
				vectorDifference(normal, 0, this._positions, i, this._positions, j);

				const distance = vectorLength(normal, 0);

				if (distance < 2 * this._radius) {
					vectorScalarProduct(
						normal,
						0,
						normal,
						0,
						0.5 * distance - this._radius
					);

					vectorDifference(this._positions, i, this._positions, i, normal, 0);
					vectorSum(this._positions, j, this._positions, j, normal, 0);

					vectorNormalized(normal, 0, normal, 0);

					vectorDifference(
						relativeVelocity,
						0,
						this._velocities,
						i,
						this._velocities,
						j
					);

					vectorScalarProduct(
						normal,
						0,
						normal,
						0,
						vectorDot(relativeVelocity, 0, normal, 0)
					);

					vectorDifference(this._velocities, i, this._velocities, i, normal, 0);
					vectorSum(this._velocities, j, this._velocities, j, normal, 0);
				}
			}

			// Gravity
			this._velocities[i + 1] -= 9.8 * delta;
		}
	}
}

function clamp(v, min, max) {
	if (v < min) {
		return min;
	}
	if (v > max) {
		return max;
	}
	return v;
}

function vectorDot(a, oa, b, ob) {
	return a[oa + 0] * b[ob + 0] + a[oa + 1] * b[ob + 1] + a[oa + 2] * b[ob + 2];
}

function vectorSum(t, ot, a, oa, b, ob) {
	for (let i = 0; i < 3; i++) {
		t[ot + i] = a[oa + i] + b[ob + i];
	}
	return t;
}

function vectorDifference(t, ot, a, oa, b, ob) {
	for (let i = 0; i < 3; i++) {
		t[ot + i] = a[oa + i] - b[ob + i];
	}
	return t;
}

function vectorLength(a, oa) {
	let length = vectorDot(a, oa, a, oa);
	length = Math.sqrt(length);
	return length;
}

function vectorScalarProduct(t, ot, a, oa, s) {
	for (let i = 0; i < 3; i++) {
		t[ot + i] = a[oa + i] * s;
	}
	return t;
}

function vectorNormalized(t, ot, a, oa) {
	const length = vectorLength(a, oa);
	for (let i = 0; i < 3; i++) {
		t[ot + i] = a[oa + i] / length;
	}
	return t;
}

function random(a, b) {
	return Math.random() * (b - a) + a;
}

Comlink.expose(BallShooter);
