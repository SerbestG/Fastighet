import { generateVapidKeys } from '../core/webpush.js';

/**
 * Skapar ett VAPID-nyckelpar för webbpush.
 *
 * Körs en gång per miljö. Den privata nyckeln hör hemma i driftmiljöns
 * hemlighetshantering och ska aldrig checkas in.
 */
const keys = generateVapidKeys();
console.log('VAPID_PUBLIC_KEY=%s', keys.publicKey);
console.log('VAPID_PRIVATE_KEY=%s', keys.privateKey);
console.log('\nLägg in värdena i miljön. Den publika nyckeln får spridas fritt;');
console.log('den privata är en hemlighet och byte av den avregistrerar alla enheter.');
