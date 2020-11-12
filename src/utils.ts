import * as MRE from '@microsoft/mixed-reality-extension-sdk';
import path from 'path';
import { get as _get } from 'http';
import { get as _gets } from 'https';
import url from 'url';
const gltfPipeline = require('gltf-pipeline');

const API_KEY = process.env['API_KEY'];

////////////////
//// utils
export function fetchJSON(_url: string): Promise<any> {
	let u = url.parse(_url);
	return new Promise((resolve, reject) => {
		let get = ((u.protocol == 'http:') ? _get : _gets);
		get(_url, res => {
			const { statusCode } = res;
			const contentType = res.headers['content-type'] as string;

			let error;
			if (statusCode !== 200) {
				error = new Error('Request Failed.\n' +
					`Status Code: ${statusCode}`);
			} else if (!/^application\/json/.test(contentType)) {
				error = new Error('Invalid content-type.\n' +
					`Expected application/json but received ${contentType}`);
			}
			if (error) {
				reject(error.message);
				// consume response data to free up memory
				res.resume();
				return;
			}

			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', (chunk) => { rawData += chunk; });
			res.on('end', () => {
				try {
					const parsedData = JSON.parse(rawData);
					resolve(parsedData);
				} catch (e) {
					reject(e.message);
				}
			});
		});
	});
}

export function fetchGltf(_url: string): Promise<any> {
	let u = url.parse(_url);
	return new Promise((resolve, reject) => {
		let get = ((u.protocol == 'http:') ? _get : _gets);
		get(_url, res => {
			const { statusCode } = res;
			const contentType = res.headers['content-type'] as string;

			let error;
			if (statusCode !== 200) {
				error = new Error('Request Failed.\n' +
					`Status Code: ${statusCode}`);
			} else if (!/^model\/gltf\+json/.test(contentType)) {
				error = new Error('Invalid content-type.\n' +
					`Expected application/json but received ${contentType}`);
			}
			if (error) {
				reject(error.message);
				// consume response data to free up memory
				res.resume();
				return;
			}

			let rawData: any = [];
			res.on('data', (chunk) => { rawData.push(chunk); });
			res.on('end', () => {
				try {
					resolve(Buffer.concat(rawData));
				} catch (e) {
					reject(e.message);
				}
			});
		});
	});
}

export function fetchBin(_url: string): Promise<any> {
	let u = url.parse(_url);
	return new Promise((resolve, reject) => {
		let get = ((u.protocol == 'http:') ? _get : _gets);
		get(_url, res => {
			const { statusCode } = res;
			const contentType = res.headers['content-type'] as string;

			let error;
			if (statusCode !== 200) {
				error = new Error('Request Failed.\n' +
					`Status Code: ${statusCode}`);
			} else if (!/^model\/gltf-binary/.test(contentType) && !/^application\/octet-stream/.test(contentType)) {
				error = new Error('Invalid content-type.\n' +
					`Expected application/json but received ${contentType}`);
			}
			if (error) {
				reject(error.message);
				// consume response data to free up memory
				res.resume();
				return;
			}

			let rawData: any = [];
			res.on('data', (chunk) => { rawData.push(chunk); });
			res.on('end', () => {
				try {
					resolve(Buffer.concat(rawData));
				} catch (e) {
					reject(e.message);
				}
			});
		});
	});
}

export function parseUser(user: MRE.User){
    let ra = user.properties['remoteAddress'];
    let ipv4 = ra.split(':').pop();
    return {
        id: user.id,
        name: user.name,
        device: user.properties['device-model'],
        ip: ipv4
    }
}

export async function ip2location(ip: string){
    console.log(`http://api.ipapi.com/${ip}?access_key=${API_KEY}`);
    const res = await fetchJSON(`http://api.ipapi.com/${ip}?access_key=${API_KEY}`);
    return {
        lat: res.latitude,
        lng: res.longitude,
        cc: res.country_code,
        country: res.country_name
    }
}

export function checkUserName(user: MRE.User, name: string){
    return user.name == name;
}

export async function getGltf(url: string){
	if (path.extname(path.basename(url)) == '.gltf'){
		return fetchGltf(url);
	}

	let buffer = await fetchBin(url);
	return gltfPipeline.glbToGltf(buffer)
		.then(function(results: any) {
			return results.gltf;
		});
}

export function joinUrl(baseUrl: string, uri: string){
    return new URL(uri, baseUrl).toString();
}

export function lineBreak(text: string, break_len: number =28){
	let ret = '';
	let lines = text.split('\n');
	lines.forEach((line,i) => {
		ret += line.slice(0, break_len);
		for (let i=1; i*break_len<line.length; i++){
			ret += '\n-' + line.slice(i*break_len, (i+1)*break_len);
		}
		if (i < lines.length - 1) ret += '\n'
	});
	return ret;
}