#include <emscripten/emscripten.h>
#include <cstdint>
#include <cstring>
#include <cstdio>

extern "C" {

// Быстрый 64-битный алгоритм хэширования FNV-1a на C++
EMSCRIPTEN_KEEPALIVE
uint64_t compute_hash(const char* str, uint64_t nonce) {
    uint64_t hash = 14695981039346656037ULL;
    while (*str) {
        hash ^= static_cast<uint8_t>(*str++);
        hash *= 1099511628211ULL;
    }
    hash ^= nonce;
    hash *= 1099511628211ULL;
    return hash;
}

// Proof-of-Work: подбор числа (nonce), при котором хэш делится на 10000.
// Заставляет браузер выполнить ~10 000 итераций на C++ (доли миллисекунды),
// но делает массовый спам ресурсозатратным для автоматических ботов.
EMSCRIPTEN_KEEPALIVE
uint64_t solve_pow(const char* message) {
    uint64_t nonce = 0;
    while (true) {
        uint64_t h = compute_hash(message, nonce);
        if (h % 10000 == 0) {
            return nonce;
        }
        nonce++;
    }
}

// Генерация 7-значного идентификатора обращения на базе хэша
EMSCRIPTEN_KEEPALIVE
int generate_ticket_id(const char* message, uint64_t timestamp) {
    uint64_t h = compute_hash(message, timestamp);
    return 1000000 + (h % 9000000);
}

}
