import { log, WebHost, Permissions } from '@microsoft/mixed-reality-extension-sdk';
import { resolve as resolvePath } from 'path';
import Hanzi from './app';
import Kanji from './kanji';

log.enable('app');

process.on('uncaughtException', (err) => console.log('uncaughtException', err));
process.on('unhandledRejection', (reason) => console.log('unhandledRejection', reason));

 // Start listening for connections, and serve static files
 // Note that process.env.BASE_URL/PORT variables will automatically be used if defined in the .env file
const server = new WebHost({
   baseDir: resolvePath(__dirname, '../public'),
   optionalPermissions: [Permissions.UserInteraction]
});

const isKanji = (process.env['KANJI'] !== undefined) ? true : false;

// Handle new application sessions
if(!isKanji){
   server.adapter.onConnection((context, params) => new Hanzi(context, params, server.baseUrl));
}else{
   server.adapter.onConnection((context, params) => new Kanji(context, params, server.baseUrl));
}

export default server;