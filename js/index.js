'use strict';

const request = require('request'),
	io = require('socket.io-client');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

module.exports = (...args) => new (class Shotty {
	constructor(host, secret, port = 443, protocol) {
		this._host = host;
		this._port = parseInt(port);
		this._protocol = protocol ? protocol : (this._port === 443 ? 'https' : 'http');
		this._serverUrl = `${this._protocol}://${this._host}:${this._port}`;
		this._secret = secret;
		this._jwt = null;

		this._request = (url, data) => new Promise((resolve, reject) =>
			request({
				url: `${this._serverUrl}/backend/api/${url}`,
				method: 'POST',
				json: data
			}, (error, response, body) => !error ? resolve(body) : false)
			.on('error', reject)
			.on('response', rsp =>
				rsp.statusCode !== 200
				? reject({host: rsp.request.host, port: rsp.request.port, url: rsp.request.path, statusCode: rsp.statusCode})
				: rsp.statusCode
			)
		);
	}

	_indexOf(data, id) {
		if(data.length <= 0) return -1;
		let idx = 0;
		for(; idx < data.length; idx++) {
			if(data[idx].id === id) break;
		}
		return idx;
	}

	_isFunction(f) {
		return typeof f === 'function';
	}

	_updateData(data, changes) {
		let idx = changes.old_val ? this._indexOf(changes.old_val.id) : data.length;

		if(changes.new_val)
			data[idx] = changes.new_val;
		else
			data.splice(idx, 1);

		return data;
	}

	connect() {
		return new Promise((resolve, reject) =>
			this._request('authBySecret', {secret: this._secret})
			.then(result =>
				!result.error
					? resolve({desc: 'authenticated with secret', data: this._jwt = result.data.token})
					: reject({desc: 'can`t authenticate with given secret', result})
			)
			.catch(result => reject({desc: 'could not authenticate with secret due to connection error', data: result}))
		);
	}

	changes(type, initCallbacks = {}) {
		if(!(type in {users: 1, chats: 1, tasks: 1, reviews: 1, todos: 1, versions: 1, shots: 1, projects: 1, lists: 1}))
			return {error: true, desc: 'wrong type of changes requested'};

		const launchCallback = (changes, type) => {
			if(type === 'init' && this._isFunction(c._onInit))
				return c._onInit(c.data);

			if(type === 'changes') {
				if(this._isFunction(c._onChange))
					c._onChange(changes.new_val, changes.old_val, c.data);

				if(changes.new_val && changes.old_val && this._isFunction(c._onUpdate))
					return c._onUpdate(changes.new_val, changes.old_val, c.data);

				if(!changes.new_val && changes.old_val && this._isFunction(c._onRemove))
					return c._onRemove(changes.old_val, c.data);

				if(changes.new_val && !changes.old_val && this._isFunction(c._onAdd))
					return c._onAdd(changes.new_val, c.data);
			}
		};

		let c = {
			_onInit: initCallbacks.onInit || null,
			_onChange: initCallbacks.onChange || null,
			_onAdd: initCallbacks.onAdd || null,
			_onRemove: initCallbacks.onRemove || null,
			_onUpdate: initCallbacks.onUpdate || null,
			_onConnect: initCallbacks.onConnect || null,
			_onDisconnect: initCallbacks.onDisconnect || null,
			onInit: callback => { c._onInit = callback; return c; },
			onChange: callback => { c._onChange = callback; return c; },
			onAdd: callback => { c._onAdd = callback; return c; },
			onRemove: callback => { c._onRemove = callback; return c; },
			onUpdate: callback => { c._onUpdate = callback; return c; },
			onDisconnect: callback => { c._onDisconnect = callback; return c; },
			disconnect: () => c.socket.emit('disconnect'),
			data: [],
			socket: io(`${this._serverUrl}/${type}`, {
				'force new connection': true,
				path: '/socket',
				query: 'token=' + this._jwt
			})
		};

		c.socket
		.on('connect', this._isFunction(c._onConnect) ? c._onConnect : () => {})
		.on('disconnect', (...args) => {
			c.data = [];
			if(this._isFunction(c._onDisconnect))
				c._onDisconnect(...args);
		})
		.on(type, payload => {
			if(payload.type === 'keepalive') {
				c.socket.emit('keepalive', 1);
				return;
			}

			if(payload.type === 'init')
				c.data = payload.data;
			else if(payload.type === 'changes' && payload.data)
				c.data = this._updateData(c.data, payload.data);

			launchCallback(payload.data, payload.type);
		});

		return c;
	}

	get get() {
		const _get = (type, id = null, projectId = null, shotId = null, versionId = null) =>
			new Promise((resolve, reject) =>
				this._request('get', {
					token: this._jwt,
					type: type,
					id: id,
					projectId: projectId,
					shotId: shotId,
					versionId: versionId
				})
				.then(resp => !resp.error ? resolve(resp.data) : reject(resp))
				.catch(reject)
			);

		return {
			user: id => _get('users', id),
			users: (...args) => _get('users', null, ...args),
			chat: id => _get('chats', id),
			chats: (...args) => _get('chats', null, ...args),
			task: id => _get('tasks', id),
			tasks: (...args) => _get('tasks', null, ...args),
			review: id => _get('reviews', id),
			reviews: (...args) => _get('reviews', null, ...args),
			todo: id => _get('reviews', id),
			todos: (...args) => _get('reviews', null, ...args),
			version: id => _get('versions', id),
			versions: (...args) => _get('versions', null, ...args),
			shot: id => _get('shots', id),
			shots: (...args) => _get('shots', null, ...args),
			project: id => _get('projects', id),
			projects: (...args) => _get('projects', null, ...args),
			list: id => _get('lists', id),
			lists: (...args) => _get('lists', null, ...args)
		}
	}
})(...args);
