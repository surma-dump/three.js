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
		this._commitedPositions = new Float32Array(this._pool.get());
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
		this._commit();
	}

	_commit() {
		this._commitedPositions.set(this._positions);
	}

	start() {
		this._lastFrame = performance.now();
		this._running = true;
		this._update();
	}

	getPositions() {
		const buffer = this._pool.get();
		new Float32Array(buffer).set(this._commitedPositions);
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
		this._commit();
		const positions = this.getPositions();
		this._cb(Comlink.transfer(positions, [positions]));
		///
		this._lastFrame = currentFrame;
		if (this._running) {
			setTimeout(() => this._update(), nextFrame - performance.now());
		}
	}

	_getPositionForBall(i) {
		return new Float32Array(
			this._positions.buffer,
			i * 3 * Float32Array.BYTES_PER_ELEMENT,
			3
		);
	}

	_getVelocityForBall(i) {
		return new Float32Array(
			this._velocities.buffer,
			i * 3 * Float32Array.BYTES_PER_ELEMENT,
			3
		);
	}

	_doPhysics(delta) {
		var range = this._roomSize / 2 - this._radius;
		for (var i = 0; i < this._numBalls; i++) {
			const ballPosition = this._getPositionForBall(i);
			const ballVelocity = this._getVelocityForBall(i);

			ballPosition[0] += ballVelocity[0] * delta;
			ballPosition[1] += ballVelocity[1] * delta;
			ballPosition[2] += ballVelocity[2] * delta;

			// Bounce of walls
			if (ballPosition[0] < -range || ballPosition[0] > range) {
				ballPosition[0] = clamp(ballPosition[0], -range, range);
				ballVelocity[0] = -ballVelocity[0] * this._dampening;
			}

			if (ballPosition[1] < this._radius || ballPosition[1] > this._roomSize) {
				ballPosition[1] = Math.max(ballPosition[1], this._radius);

				ballVelocity[0] *= this._dampening;
				ballVelocity[1] = -ballVelocity[1] * this._dampening;
				ballVelocity[2] *= this._dampening;
			}

			if (ballPosition[2] < -range || ballPosition[2] > range) {
				ballPosition[2] = clamp(ballPosition[2], -range, range);
				ballVelocity[2] = -ballVelocity[2] * this._dampening;
			}

			const normal = new Float32Array(3);
			const relativeVelocity = new Float32Array(3);
			// // Bounce of other balls
			for (var j = i + 1; j < this._numBalls; j++) {
				const otherBallPosition = this._getPositionForBall(j);
				const otherBallVelocity = this._getVelocityForBall(j);

				vectorDifference(normal, ballPosition, otherBallPosition);

				const distance = vectorLength(normal);

				if (distance < 2 * this._radius) {
					vectorScalarProduct(normal, normal, 0.5 * distance - this._radius);

					vectorDifference(ballPosition, ballPosition, normal);
					vectorSum(otherBallPosition, otherBallPosition, normal);

					vectorNormalized(normal, normal);

					vectorDifference(relativeVelocity, ballVelocity, otherBallVelocity);

					vectorScalarProduct(
						normal,
						normal,
						vectorDot(relativeVelocity, normal)
					);

					vectorDifference(ballVelocity, ballVelocity, normal);
					vectorSum(otherBallVelocity, otherBallVelocity, normal);
				}
			}

			// Gravity
			ballVelocity[1] -= 9.8 * delta;
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
	t.forEach((_, i) => (t[i] = a[i] + b[i]));
	return t;
}

function vectorDifference(t, a, b) {
	t.forEach((_, i) => (t[i] = a[i] - b[i]));
	return t;
}

function vectorLength(a) {
	let length = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
	length = Math.sqrt(length);
	return length;
}

function vectorScalarProduct(t, a, s) {
	t.forEach((_, i) => (t[i] = a[i] * s));
	return t;
}

function vectorNormalized(t, a) {
	const length = vectorLength(a);
	t.forEach((_, i) => (t[i] = a[i] / length));
	return t;
}

function random(a, b) {
	return Math.random() * (b - a) + a;
}

Comlink.expose(BallShooter);
