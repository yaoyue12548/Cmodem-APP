#if !defined(__APPLE__)
#include <jni.h>
#endif

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>

namespace {

struct DecodedSms {
    bool ok = false;
    bool outgoing = false;
    std::string number;
    std::string text;
    std::string time;
};

int hexValue(char value) {
    if (value >= '0' && value <= '9') return value - '0';
    value = static_cast<char>(std::tolower(static_cast<unsigned char>(value)));
    return value >= 'a' && value <= 'f' ? value - 'a' + 10 : -1;
}

bool hexBytes(const std::string& input, std::vector<uint8_t>& output) {
    std::string clean;
    clean.reserve(input.size());
    for (char value : input) {
        if (std::isspace(static_cast<unsigned char>(value))) continue;
        if (hexValue(value) < 0) return false;
        clean.push_back(value);
    }
    if (clean.size() < 8 || clean.size() > 8192 || clean.size() % 2 != 0) return false;
    output.reserve(clean.size() / 2);
    for (size_t index = 0; index < clean.size(); index += 2) {
        output.push_back(static_cast<uint8_t>((hexValue(clean[index]) << 4) | hexValue(clean[index + 1])));
    }
    return true;
}

void appendUtf8(std::string& output, uint32_t codepoint) {
    if (codepoint <= 0x7f) output.push_back(static_cast<char>(codepoint));
    else if (codepoint <= 0x7ff) {
        output.push_back(static_cast<char>(0xc0 | (codepoint >> 6)));
        output.push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
    } else if (codepoint <= 0xffff) {
        output.push_back(static_cast<char>(0xe0 | (codepoint >> 12)));
        output.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3f)));
        output.push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
    } else if (codepoint <= 0x10ffff) {
        output.push_back(static_cast<char>(0xf0 | (codepoint >> 18)));
        output.push_back(static_cast<char>(0x80 | ((codepoint >> 12) & 0x3f)));
        output.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3f)));
        output.push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
    }
}

std::string decodeUcs2(const uint8_t* bytes, size_t length) {
    std::string output;
    for (size_t index = 0; index + 1 < length; index += 2) {
        uint32_t codepoint = (static_cast<uint32_t>(bytes[index]) << 8) | bytes[index + 1];
        if (codepoint >= 0xd800 && codepoint <= 0xdbff && index + 3 < length) {
            const uint32_t low = (static_cast<uint32_t>(bytes[index + 2]) << 8) | bytes[index + 3];
            if (low >= 0xdc00 && low <= 0xdfff) {
                codepoint = 0x10000 + ((codepoint - 0xd800) << 10) + (low - 0xdc00);
                index += 2;
            }
        }
        if (codepoint == 0) continue;
        appendUtf8(output, codepoint >= 0xd800 && codepoint <= 0xdfff ? 0xfffd : codepoint);
    }
    return output;
}

uint32_t gsmCodepoint(uint8_t value) {
    static const uint16_t table[128] = {
        0x0040,0x00a3,0x0024,0x00a5,0x00e8,0x00e9,0x00f9,0x00ec,0x00f2,0x00c7,0x000a,0x00d8,0x00f8,0x000d,0x00c5,0x00e5,
        0x0394,0x005f,0x03a6,0x0393,0x039b,0x03a9,0x03a0,0x03a8,0x03a3,0x0398,0x039e,0x0000,0x00c6,0x00e6,0x00df,0x00c9,
        0x0020,0x0021,0x0022,0x0023,0x00a4,0x0025,0x0026,0x0027,0x0028,0x0029,0x002a,0x002b,0x002c,0x002d,0x002e,0x002f,
        0x0030,0x0031,0x0032,0x0033,0x0034,0x0035,0x0036,0x0037,0x0038,0x0039,0x003a,0x003b,0x003c,0x003d,0x003e,0x003f,
        0x00a1,0x0041,0x0042,0x0043,0x0044,0x0045,0x0046,0x0047,0x0048,0x0049,0x004a,0x004b,0x004c,0x004d,0x004e,0x004f,
        0x0050,0x0051,0x0052,0x0053,0x0054,0x0055,0x0056,0x0057,0x0058,0x0059,0x005a,0x00c4,0x00d6,0x00d1,0x00dc,0x00a7,
        0x00bf,0x0061,0x0062,0x0063,0x0064,0x0065,0x0066,0x0067,0x0068,0x0069,0x006a,0x006b,0x006c,0x006d,0x006e,0x006f,
        0x0070,0x0071,0x0072,0x0073,0x0074,0x0075,0x0076,0x0077,0x0078,0x0079,0x007a,0x00e4,0x00f6,0x00f1,0x00fc,0x00e0
    };
    return table[value & 0x7f];
}

uint32_t gsmExtension(uint8_t value) {
    switch (value) {
        case 0x0a: return 0x000c;
        case 0x14: return 0x005e;
        case 0x28: return 0x007b;
        case 0x29: return 0x007d;
        case 0x2f: return 0x005c;
        case 0x3c: return 0x005b;
        case 0x3d: return 0x007e;
        case 0x3e: return 0x005d;
        case 0x40: return 0x007c;
        case 0x65: return 0x20ac;
        default: return 0xfffd;
    }
}

std::string decodeGsm7(const uint8_t* bytes, size_t length, size_t bitOffset, size_t septets) {
    std::string output;
    bool escaped = false;
    for (size_t index = 0; index < septets; ++index) {
        const size_t bit = bitOffset + index * 7;
        const size_t byteIndex = bit / 8;
        const unsigned shift = static_cast<unsigned>(bit % 8);
        if (byteIndex >= length) break;
        uint16_t packed = bytes[byteIndex];
        if (byteIndex + 1 < length) packed |= static_cast<uint16_t>(bytes[byteIndex + 1]) << 8;
        const uint8_t value = static_cast<uint8_t>((packed >> shift) & 0x7f);
        if (escaped) {
            appendUtf8(output, gsmExtension(value));
            escaped = false;
        } else if (value == 0x1b) escaped = true;
        else appendUtf8(output, gsmCodepoint(value));
    }
    return output;
}

char addressDigit(uint8_t nibble) {
    if (nibble <= 9) return static_cast<char>('0' + nibble);
    if (nibble == 0x0a) return '*';
    if (nibble == 0x0b) return '#';
    if (nibble >= 0x0c && nibble <= 0x0e) return static_cast<char>('a' + nibble - 0x0c);
    return 0;
}

std::string decodeAddress(const uint8_t* bytes, size_t byteLength, size_t digits, uint8_t type) {
    std::string output;
    const size_t prefix = (type & 0x70) == 0x10 ? 1 : 0;
    if (prefix) output.push_back('+');
    const size_t target = digits + prefix;
    for (size_t index = 0; index < byteLength && output.size() < target; ++index) {
        const char low = addressDigit(bytes[index] & 0x0f);
        const char high = addressDigit((bytes[index] >> 4) & 0x0f);
        if (low && output.size() < target) output.push_back(low);
        if (high && output.size() < target) output.push_back(high);
    }
    return output;
}

int swappedDecimal(uint8_t value) {
    return (value & 0x0f) * 10 + ((value >> 4) & 0x0f);
}

std::string decodeTimestamp(const uint8_t* bytes) {
    const int yearPart = swappedDecimal(bytes[0]);
    const int year = yearPart >= 70 ? 1900 + yearPart : 2000 + yearPart;
    const int month = swappedDecimal(bytes[1]);
    const int day = swappedDecimal(bytes[2]);
    const int hour = swappedDecimal(bytes[3]);
    const int minute = swappedDecimal(bytes[4]);
    const int second = swappedDecimal(bytes[5]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return {};
    std::ostringstream output;
    output << year << '/';
    output.width(2); output.fill('0'); output << month << '/';
    output.width(2); output << day << ' ';
    output.width(2); output << hour << ':';
    output.width(2); output << minute << ':';
    output.width(2); output << second;
    return output.str();
}

std::string decodeUserData(const uint8_t* bytes, size_t available, uint8_t dcs, size_t length, bool hasHeader) {
    const bool ucs2 = (dcs & 0x0c) == 0x08;
    const bool eightBit = (dcs & 0x0c) == 0x04;
    size_t headerBytes = 0;
    if (hasHeader) {
        if (available == 0) return {};
        headerBytes = static_cast<size_t>(bytes[0]) + 1;
        if (headerBytes > available) return {};
    }
    if (ucs2) {
        const size_t byteCount = std::min(length, available);
        return decodeUcs2(bytes + headerBytes, byteCount > headerBytes ? byteCount - headerBytes : 0);
    }
    if (eightBit) {
        const size_t byteCount = std::min(length, available);
        std::string output;
        for (size_t index = headerBytes; index < byteCount; ++index) appendUtf8(output, bytes[index]);
        return output;
    }
    const size_t headerSeptets = (headerBytes * 8 + 6) / 7;
    const size_t septets = length > headerSeptets ? length - headerSeptets : 0;
    return decodeGsm7(bytes, available, headerSeptets * 7, septets);
}

bool parseAt(const std::vector<uint8_t>& bytes, size_t& position, uint8_t& value) {
    if (position >= bytes.size()) return false;
    value = bytes[position++];
    return true;
}

DecodedSms decodePdu(const std::string& input) {
    std::vector<uint8_t> bytes;
    if (!hexBytes(input, bytes)) return {};
    size_t position = 0;
    if (!bytes.empty()) {
        const size_t smscBytes = static_cast<size_t>(bytes[0]) + 1;
        if (smscBytes < bytes.size() && (bytes[smscBytes] & 0x03) <= 1) position = smscBytes;
    }
    uint8_t first = 0;
    if (!parseAt(bytes, position, first)) return {};
    const uint8_t type = first & 0x03;
    const bool outgoing = type == 1;
    if (type != 0 && type != 1) return {};
    if (outgoing) {
        uint8_t reference = 0;
        if (!parseAt(bytes, position, reference)) return {};
        (void)reference;
    }
    uint8_t digits = 0, addressType = 0;
    if (!parseAt(bytes, position, digits) || !parseAt(bytes, position, addressType)) return {};
    const size_t addressBytes = (static_cast<size_t>(digits) + 1) / 2;
    if (position + addressBytes > bytes.size()) return {};
    const std::string number = decodeAddress(bytes.data() + position, addressBytes, digits, addressType);
    position += addressBytes;
    uint8_t protocol = 0, dcs = 0;
    if (!parseAt(bytes, position, protocol) || !parseAt(bytes, position, dcs)) return {};
    (void)protocol;
    std::string timestamp;
    if (outgoing) {
        const uint8_t validity = (first >> 3) & 0x03;
        const size_t validityBytes = validity == 0 ? 0 : validity == 2 ? 1 : 7;
        if (position + validityBytes > bytes.size()) return {};
        position += validityBytes;
    } else {
        if (position + 7 > bytes.size()) return {};
        timestamp = decodeTimestamp(bytes.data() + position);
        position += 7;
    }
    uint8_t userLength = 0;
    if (!parseAt(bytes, position, userLength)) return {};
    DecodedSms result;
    result.ok = true;
    result.outgoing = outgoing;
    result.number = number;
    result.time = timestamp;
    result.text = decodeUserData(bytes.data() + position, bytes.size() - position, dcs, userLength, (first & 0x40) != 0);
    return result;
}

std::string jsonEscape(const std::string& input) {
    std::string output;
    output.reserve(input.size() + 16);
    for (unsigned char value : input) {
        switch (value) {
            case '"': output += "\\\""; break;
            case '\\': output += "\\\\"; break;
            case '\b': output += "\\b"; break;
            case '\f': output += "\\f"; break;
            case '\n': output += "\\n"; break;
            case '\r': output += "\\r"; break;
            case '\t': output += "\\t"; break;
            default:
                if (value < 0x20) {
                    static const char hex[] = "0123456789abcdef";
                    output += "\\u00";
                    output.push_back(hex[value >> 4]);
                    output.push_back(hex[value & 0x0f]);
                } else output.push_back(static_cast<char>(value));
        }
    }
    return output;
}

std::string toJson(const DecodedSms& message) {
    if (!message.ok) return {};
    return std::string("{\"ok\":true,\"outgoing\":") + (message.outgoing ? "true" : "false") +
        ",\"number\":\"" + jsonEscape(message.number) + "\",\"text\":\"" + jsonEscape(message.text) +
        "\",\"time\":\"" + jsonEscape(message.time) + "\"}";
}

#if !defined(__APPLE__)
std::string fromJava(JNIEnv* environment, jstring value) {
    if (value == nullptr) return {};
    const char* chars = environment->GetStringUTFChars(value, nullptr);
    if (chars == nullptr) return {};
    std::string result(chars);
    environment->ReleaseStringUTFChars(value, chars);
    return result;
}

jstring toJava(JNIEnv* environment, const std::string& value) {
    std::vector<jchar> utf16;
    utf16.reserve(value.size());
    for (size_t index = 0; index < value.size();) {
        const uint8_t first = static_cast<uint8_t>(value[index++]);
        uint32_t codepoint = 0xfffd;
        size_t continuation = 0;
        if (first < 0x80) codepoint = first;
        else if ((first & 0xe0) == 0xc0) { codepoint = first & 0x1f; continuation = 1; }
        else if ((first & 0xf0) == 0xe0) { codepoint = first & 0x0f; continuation = 2; }
        else if ((first & 0xf8) == 0xf0) { codepoint = first & 0x07; continuation = 3; }
        bool valid = index + continuation <= value.size();
        for (size_t offset = 0; valid && offset < continuation; ++offset) {
            const uint8_t next = static_cast<uint8_t>(value[index + offset]);
            if ((next & 0xc0) != 0x80) valid = false;
            else codepoint = (codepoint << 6) | (next & 0x3f);
        }
        if (valid) index += continuation; else codepoint = 0xfffd;
        if (codepoint <= 0xffff && !(codepoint >= 0xd800 && codepoint <= 0xdfff)) utf16.push_back(static_cast<jchar>(codepoint));
        else if (codepoint <= 0x10ffff) {
            codepoint -= 0x10000;
            utf16.push_back(static_cast<jchar>(0xd800 + (codepoint >> 10)));
            utf16.push_back(static_cast<jchar>(0xdc00 + (codepoint & 0x3ff)));
        } else utf16.push_back(static_cast<jchar>(0xfffd));
    }
    return environment->NewString(utf16.data(), static_cast<jsize>(utf16.size()));
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_com_fhcpeboard_android_NativeCore_nativeVersion(JNIEnv* environment, jobject) {
    return toJava(environment, "fhcpecore/2");
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_fhcpeboard_android_NativeCore_nativeSelfTest(JNIEnv*, jobject) {
    const DecodedSms result = decodePdu("00000491214300086211219080700004004F004B");
    const DecodedSms emoji = decodePdu("00000491214300086211219080700004D83DDE00");
    return result.ok && result.number == "+1234" && result.text == "OK" &&
        result.time == "2026/11/12 09:08:07" && emoji.text == "\xf0\x9f\x98\x80" ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_fhcpeboard_android_NativeCore_nativeDecodeSmsPdu(JNIEnv* environment, jobject, jstring pdu) {
    return toJava(environment, toJson(decodePdu(fromJava(environment, pdu))));
}
#else
}  // namespace

extern "C" int fhcpe_decode_sms_pdu(const char* input, char* output, size_t capacity) {
    if (input == nullptr || output == nullptr || capacity == 0) return 0;
    const std::string result = toJson(decodePdu(input));
    if (result.empty() || result.size() + 1 > capacity) {
        output[0] = '\0';
        return 0;
    }
    std::memcpy(output, result.c_str(), result.size() + 1);
    return static_cast<int>(result.size());
}
#endif
