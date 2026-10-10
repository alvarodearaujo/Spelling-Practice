/*
  Azure AI Speech settings.

  Preferred (safe for the browser): point `tokenEndpoint` at your own backend
  route that calls the Azure `issueToken` API with the subscription key kept on
  the server and returns the short-lived token as plain text or {"token": "..."}.

  `subscriptionKeyEnc` holds an XOR+base64 obfuscated key. This is NOT security:
  the decode routine lives in speech.js, so anyone with these files recovers the
  key. Development only, never on a public deployment.

  Regenerate the obfuscated value with:
    node -e "const k='YOUR_KEY',p='LetterListen';let o=[];for(let i=0;i<k.length;i++)o.push(k.charCodeAt(i)^p.charCodeAt(i%p.length));console.log(Buffer.from(o).toString('base64'))"
*/
window.SPEECH_CONFIG = {
  region: "eastus",      // must match the Speech resource
  tokenEndpoint: "",     // e.g. "/api/speech-token"
  subscriptionKeyEnc: "LgFMQl0Qe1pGElxWeFJHFgQXLVsQElMPflUSEFVFeQ8=",
  voice: "en-US-JennyNeural",
  language: "en-US"
};
