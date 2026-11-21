#include <iostream>
#include <string>
#include <cstdlib>
#include <cstdint>
#include <curl/curl.h>
#include "httplib.h"
#include "json.hpp"

using json = nlohmann::json;

uint64_t verify_hash(const std::string& str, uint64_t nonce) {
    uint64_t hash = 14695981039346656037ULL;
    for (unsigned char c : str) {
        hash ^= c;
        hash *= 1099511628211ULL;
    }
    hash ^= nonce;
    hash *= 1099511628211ULL;
    return hash;
}

std::string escape_html(const std::string& data) {
    std::string buffer;
    buffer.reserve(data.size());
    for (char c : data) {
        switch (c) {
            case '&':  buffer.append("&amp;");  break;
            case '<':  buffer.append("&lt;");   break;
            case '>':  buffer.append("&gt;");   break;
            case '"':  buffer.append("&quot;"); break;
            default:   buffer.push_back(c);     break;
        }
    }
    return buffer;
}

size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* userp) {
    userp->append((char*)contents, size * nmemb);
    return size * nmemb;
}

json telegram_api_request(const std::string& token, const std::string& method, const json& payload) {
    CURL* curl = curl_easy_init();
    std::string readBuffer;
    if (!curl) return {{"ok", false}, {"description", "CURL init failed"}};

    std::string url = "https://telegram.org" + token + "/" + method;
    std::string json_str = payload.dump();

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_str.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);

    CURLcode res = curl_easy_perform(curl);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) {
        return {{"ok", false}, {"description", curl_easy_strerror(res)}};
    }
    return json::parse(readBuffer, nullptr, false);
}

int main() {
    const char* env_token = std::getenv("TG_BOT_TOKEN");
    const char* env_chat = std::getenv("TG_CHAT_ID");

    if (!env_token || !env_chat) {
        std::cerr << "Error: TG_BOT_TOKEN or TG_CHAT_ID environment variables not set!\n";
        return 1;
    }

    std::string bot_token(env_token);
    std::string chat_id(env_chat);

    httplib::Server svr;

    svr.Options("/api/send", [](const httplib::Request&, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type");
        res.status = 204;
    });

    svr.Post("/api/send", [&](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");

        auto body = json::parse(req.body, nullptr, false);
        if (body.is_discarded() || !body.contains("text") || !body.contains("nonce")) {
            res.status = 400;
            res.set_content(R"({"ok":false,"description":"Invalid JSON payload"})", "application/json");
            return;
        }

        std::string text = body["text"];
        std::string category = body.value("category", "review");
        uint64_t nonce = body["nonce"];
        int ticket_id = body.value("ticketId", 1000000);

        if (verify_hash(text, nonce) % 10000 != 0) {
            res.status = 403;
            res.set_content(R"({"ok":false,"description":"Invalid Proof-of-Work signature"})", "application/json");
            return;
        }

        bool is_admin = (category == "admin");
        std::string tag_prefix = is_admin ? "админ" : "отзыв";
        std::string category_label = is_admin ? "🚨 Вызов админа" : "⭐️ Отзыв";

        std::string topic_title = "#" + tag_prefix + "_" + std::to_string(ticket_id);
        std::string safe_text = escape_html(text.substr(0, 1000));

        json topic_res = telegram_api_request(bot_token, "createForumTopic", {
            {"chat_id", chat_id},
            {"name", topic_title}
        });

        if (!topic_res.value("ok", false)) {
            res.set_content(topic_res.dump(), "application/json");
            return;
        }

        int thread_id = topic_res["result"]["message_thread_id"];

        json msg_res = telegram_api_request(bot_token, "sendMessage", {
            {"chat_id", chat_id},
            {"message_thread_id", thread_id},
            {"text", "📬 <b>Обращение " + topic_title + "</b>\n📌 <b>Категория:</b> " + category_label + "\n\n" + safe_text},
            {"parse_mode", "HTML"}
        });

        res.set_content(msg_res.dump(), "application/json");
    });

    std::cout << "C++ Ticket Server running on port 8080...\n";
    svr.listen("0.0.0.0", 8080);
    return 0;
}
