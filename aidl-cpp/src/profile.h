#pragma once
#ifdef AIDL_PROFILE
#include <emscripten.h>
static double phases[4];
extern "C" EMSCRIPTEN_KEEPALIVE double aidl_metric(int phase) { return phases[phase]; }
#define PROFILE_BEGIN double profile_time = emscripten_get_now()
#define PROFILE_END(index) do { double now = emscripten_get_now(); phases[index] = now - profile_time; profile_time = now; } while (false)
#else
#define PROFILE_BEGIN
#define PROFILE_END(index)
#endif
