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
		this._balls = Array.from({ length: this._numBalls }, (_, i) => {
			return {
				index: i,
				position: this._positions.subarray(i * 3, i * 3 + 3),
				velocity: this._velocities.subarray(i * 3, i * 3 + 3)
			};
		});
		this._init();
	}

	setCallback(cb) {
		this._cb = cb;
	}

	_init() {
		for (var i = 0; i < this._numBalls; i++) {
			this._balls[i].position[0] = random(
				-this._roomSize / 2 + 1,
				this._roomSize / 2 - 1
			);
			this._balls[i].position[1] = random(0, this._roomSize);
			this._balls[i].position[2] = random(
				-this._roomSize / 2 + 1,
				this._roomSize / 2 - 1
			);

			this._balls[i].velocity[0] = random(-0.005, 0.005);
			this._balls[i].velocity[1] = random(-0.005, 0.005);
			this._balls[i].velocity[2] = random(-0.005, 0.005);
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
		for (var i = 0; i < this._numBalls; i++) {
			const ball = this._balls[i];
			ball.position[0] += ball.velocity[0] * delta;
			ball.position[1] += ball.velocity[1] * delta;
			ball.position[2] += ball.velocity[2] * delta;

			// Bounce of walls
			if (ball.position[0] < -range || ball.position[0] > range) {
				ball.position[0] = clamp(ball.position[0], -range, range);
				ball.velocity[0] = -ball.velocity[0] * this._dampening;
			}

			if (
				ball.position[1] < this._radius ||
				ball.position[1] > this._roomSize
			) {
				ball.position[1] = Math.max(ball.position[1], this._radius);

				ball.velocity[0] *= this._dampening;
				ball.velocity[1] = -ball.velocity[1] * this._dampening;
				ball.velocity[2] *= this._dampening;
			}

			if (ball.position[2] < -range || ball.position[2] > range) {
				ball.position[2] = clamp(ball.position[2], -range, range);
				ball.velocity[2] = -ball.velocity[2] * this._dampening;
			}

			// // Bounce of other balls
			for (var j = i + 1; j < this._numBalls; j++) {
				const otherBall = this._balls[j];
				vectorDifference(normal, ball.position, otherBall.position);

				const distance = vectorLength(normal, 0);

				if (distance < 2 * this._radius) {
					vectorScalarProduct(normal, normal, 0.5 * distance - this._radius);

					vectorDifference(ball.position, ball.position, normal);
					vectorSum(otherBall.position, otherBall.position, normal);

					vectorNormalized(normal, normal);

					vectorDifference(relativeVelocity, ball.velocity, otherBall.velocity);

					vectorScalarProduct(
						normal,
						normal,
						vectorDot(relativeVelocity, normal)
					);

					vectorDifference(ball.velocity, ball.velocity, normal);
					vectorSum(otherBall.velocity, otherBall.velocity, normal);
				}
			}

			// Gravity
			ball.velocity[1] -= 9.8 * delta;
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

function vectorDot(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vectorSum(t, a, b) {
	for (let i = 0; i < 3; i++) {
		t[i] = a[i] + b[i];
	}
	return t;
}

function vectorDifference(t, a, b) {
	for (let i = 0; i < 3; i++) {
		t[i] = a[i] - b[i];
	}
	return t;
}

function vectorLength(a) {
	let length = vectorDot(a, a);
	length = Math.sqrt(length);
	return length;
}

function vectorScalarProduct(t, a, s) {
	for (let i = 0; i < 3; i++) {
		t[i] = a[i] * s;
	}
	return t;
}

function vectorNormalized(t, a) {
	const length = vectorLength(a);
	for (let i = 0; i < 3; i++) {
		t[i] = a[i] / length;
	}
	return t;
}

function random(a, b) {
	return Math.random() * (b - a) + a;
}

Comlink.expose(BallShooter);
