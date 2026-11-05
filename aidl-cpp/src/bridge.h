#pragma once
#include <nlohmann/json.hpp>
#include "aidl_language.h"
using Json = nlohmann::ordered_json;
extern Json diagnostics;
Json location_json(const AidlLocation& location);
