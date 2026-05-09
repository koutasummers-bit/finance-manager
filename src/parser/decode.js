// CSV ファイルのバイト列を文字列にデコードする。
// SMBC/VPass の CSV は Shift_JIS が標準だが、ユーザーが Excel で再保存した場合は
// UTF-8 (BOM 付き) になることがある。BOM 検出 → SJIS → UTF-8 の順で試す。

const UTF8_BOM = [0xef, 0xbb, 0xbf];

function hasUtf8Bom(bytes) {
  return (
    bytes.length >= 3 &&
    bytes[0] === UTF8_BOM[0] &&
    bytes[1] === UTF8_BOM[1] &&
    bytes[2] === UTF8_BOM[2]
  );
}

function tryDecode(bytes, encoding, fatal) {
  try {
    const decoder = new TextDecoder(encoding, { fatal });
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

export function decodeBytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  if (hasUtf8Bom(view)) {
    return tryDecode(view.subarray(3), 'utf-8', false) ?? '';
  }

  const sjis = tryDecode(view, 'shift_jis', true);
  if (sjis !== null) return sjis;

  return tryDecode(view, 'utf-8', false) ?? '';
}

export async function decodeFile(file) {
  const buffer = await file.arrayBuffer();
  return decodeBytes(new Uint8Array(buffer));
}
