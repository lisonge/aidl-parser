#pragma once
#include "bridge.h"
#include <charconv>
#include <vector>

// Stream containers directly; nlohmann handles UTF-8 validation and escaping.
class Writer {
  struct Frame { bool object; bool first = true; };
  std::vector<Frame> stack;
  void separator() {
    if (stack.back().first) stack.back().first = false;
    else text += ',';
  }
  void prefix() { if (!stack.empty() && !stack.back().object) separator(); }
  void quoted(const std::string& value) {
    text += Json(value).dump(-1, ' ', false, Json::error_handler_t::replace);
  }
 public:
  std::string text;
  Writer() { text.reserve(4096); }
  void object() { prefix(); text += '{'; stack.push_back({true}); }
  void array() { prefix(); text += '['; stack.push_back({false}); }
  void end() { text += stack.back().object ? '}' : ']'; stack.pop_back(); }
  void key(const char* key) { separator(); text += '"'; text += key; text += "\":"; }
  void key(const std::string& key) { separator(); quoted(key); text += ':'; }
  void value(const std::string& value) { prefix(); quoted(value); }
  void value(int value) {
    prefix(); char buffer[24]; auto result = std::to_chars(buffer, buffer + sizeof(buffer), value);
    text.append(buffer, result.ptr);
  }
  void boolean(bool value) { prefix(); text += value ? "true" : "false"; }
  void raw(const Json& value) { prefix(); text += value.dump(-1, ' ', false, Json::error_handler_t::replace); }
  void field(const char* key, const std::string& value) { if (!value.empty()) { this->key(key); this->value(value); } }
  void flag(const char* key, bool value) { if (value) { this->key(key); boolean(true); } }
};
