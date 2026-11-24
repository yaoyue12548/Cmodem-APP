// GSM 03.38 default alphabet and extension table used by SMS-DELIVER/SUBMIT.
const gsmAlphabet = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const gsmExtended = {10:'\f',20:'^',40:'{',41:'}',47:'\\',60:'[',61:'~',62:']',64:'|',101:'€'};
function gsmText(bytes, start, end) {
  let text = '', escaped = false;
  for (let bit = start * 7; bit < end * 7; bit += 7) {
    const i = bit >> 3;
    const n = ((bytes[i] | ((bytes[i + 1] || 0) << 8)) >> (bit % 8)) & 127;
    if (escaped) { text += gsmExtended[n] || '�'; escaped = false; }
    else if (n === 27) escaped = true;
    else text += gsmAlphabet[n];
  }
  return text;
}
function decodeSmsPdu(input) {
  const hex = String(input).replace(/\s+/g, '');
  if (!/^(?:[0-9a-f]{2}){2,512}$/i.test(hex)) return '';
  const bytes = Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
  const smsc = bytes[0] + 1;
  let i = smsc < bytes.length && (bytes[smsc] & 3) <= 1 ? smsc : 0;
  const flags = bytes[i++], type = flags & 3;
  if (type > 1) return '';
  const outgoing = type === 1;
  if (outgoing) i++;
  const digits = bytes[i++], addressType = bytes[i++], n = Math.ceil(digits / 2);
  if (i + n + 2 >= bytes.length) return '';
  const address = bytes.subarray(i, i+n);
  let number;
  if ((addressType & 112) === 80) number = gsmText(address, 0, Math.floor(digits * 4 / 7));
  else {
    const dial = '0123456789*#abc';
    number = (addressType & 112) === 16 ? '+' : '';
    for (let j = 0; j < digits; j++) number += dial[(address[j >> 1] >> (j % 2 * 4)) & 15] || '';
  }
  i += n + 1; // Skip TP-PID.
  const dcs = bytes[i++];
  let time = '';
  if (outgoing) i += [0,7,1,7][(flags >> 3) & 3];
  else {
    if (i + 7 >= bytes.length) return '';
    const [yy, mm, dd, h, m, s] = Array.from(bytes.slice(i,i+6), b => ''+(b&15)+(b>>4));
    time = (Number(yy) >= 70 ? '19' : '20')+yy+'/'+mm+'/'+dd+' '+h+':'+m+':'+s;
    i += 7;
  }
  if (i >= bytes.length) return '';
  const length = bytes[i++], data = bytes.subarray(i), header = (flags & 64) ? data[0]+1 : 0;
  const encoding = dcs & 12;
  const octets = encoding === 0 ? Math.ceil(length * 7 / 8) : length;
  if (!Number.isFinite(header) || header > octets || data.length < octets) return '';
  let text = '';
  if (encoding === 0) text = gsmText(data, Math.ceil(header * 8 / 7), length);
  else if (encoding === 8) {
    for (let j = header; j + 1 < length; j += 2) text += String.fromCharCode(data[j] << 8 | data[j+1]);
  } else {
    text = String.fromCharCode(...data.subarray(header, length));
  }
  return JSON.stringify({ok:true, outgoing, number, time, text});
}
