#pragma once
#include <ostream>
#include <string>

struct SourcePosition {
  std::string* filename;
  int line;
  int column;
  int offset;
  bool after_cr;
};
struct SourceLocation {
  SourcePosition begin, end;
  void step() { begin = end; }
  void consume(const char* text, int size) {
    step();
    for (int i = 0; i < size; ++i) {
      const char c = text[i];
      ++end.offset;
      if (c == '\r') { ++end.line; end.column = 1; }
      else if (c == '\n') { if (!end.after_cr) ++end.line; end.column = 1; }
      else ++end.column;
      end.after_cr = c == '\r';
    }
  }
};
inline std::ostream& operator<<(std::ostream& out, const SourceLocation& loc) {
  return out << loc.begin.line << ':' << loc.begin.column << '-' << loc.end.line << ':' << loc.end.column;
}
