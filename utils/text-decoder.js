// utils/text-decoder.js

/**
 * 简单的 UTF-8 解码器，用于兼容不支持 TextDecoder 的真机环境
 */
function decode(arrayBuffer) {
  let uint8Array = new Uint8Array(arrayBuffer); // 这里定义的是大写 A
  let out, i, len, c;
  let char2, char3;

  out = "";
  len = uint8Array.length;
  i = 0;

  while (i < len) {
    c = uint8Array[i++];
    switch (c >> 4) {
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        // 0xxxxxxx
        out += String.fromCharCode(c);
        break;
      case 12:
      case 13:
        // 110x xxxx   10xx xxxx
        char2 = uint8Array[i++];
        out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
        break;
      case 14:
        // 1110 xxxx  10xx xxxx  10xx xxxx
        char2 = uint8Array[i++];
        
        // 【核心修改】这里之前写成了 uint8array (小写a)，请改为 uint8Array (大写A)
        char3 = uint8Array[i++]; 
        
        out += String.fromCharCode(((c & 0x0F) << 12) |
          ((char2 & 0x3F) << 6) |
          ((char3 & 0x3F) << 0));
        break;
    }
  }

  return out;
}

module.exports = {
  decode
};