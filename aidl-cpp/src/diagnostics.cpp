#include "bridge.h"
#include "generated/wire.h"
#include <sstream>
#include <stdexcept>

Json diagnostics = Json::array();
bool AidlErrorLog::sHadError = false;
AidlErrorLog::AidlErrorLog(Severity severity, const AidlLocation& location, const std::string& suffix)
    : os_(new std::ostringstream()), severity_(severity), location_(location), suffix_(suffix) {
  sHadError |= severity >= ERROR;
}
AidlErrorLog::AidlErrorLog(Severity severity, const AidlNode& node) : AidlErrorLog(severity, node.GetLocation()) {}
AidlErrorLog::AidlErrorLog(Severity severity, const std::string& filename)
    : AidlErrorLog(severity, AidlLocation(filename, AidlLocation::Source::EXTERNAL)) {}
AidlErrorLog::~AidlErrorLog() {
  auto stream = static_cast<std::ostringstream*>(os_);
  if (severity_ != NO_OP) diagnostics.push_back({{"s", severity_ == WARNING ? wire::s_warning : wire::s_error}, {"msg", stream->str() + suffix_}, {"p", location_json(location_)}});
  delete stream;
}
