cmake_minimum_required(VERSION 3.20)
project(aidl_wasm LANGUAGES C CXX)
option(AIDL_PROFILE "Build separate instrumented benchmark artifact" OFF)
set(CMAKE_CXX_STANDARD 20)
set(AIDL "${CMAKE_CURRENT_SOURCE_DIR}/build/source")
set(BASE "${CMAKE_CURRENT_SOURCE_DIR}/upstream/libbase")
set(GEN "${CMAKE_CURRENT_SOURCE_DIR}/build/generated")
add_executable(aidl
  src/wasm_api.cpp src/diagnostics.cpp
  "${GEN}/aidl_language_y.cpp" "${GEN}/aidl_language_l.cpp"
  "${AIDL}/parser.cpp" "${AIDL}/aidl_language.cpp" "${AIDL}/aidl_const_expressions.cpp"
  "${AIDL}/aidl_typenames.cpp" "${AIDL}/comments.cpp" "${AIDL}/location.cpp"
  "${AIDL}/permission.cpp" "${AIDL}/code_writer.cpp"
  "${BASE}/strings.cpp" "${BASE}/stringprintf.cpp")
target_include_directories(aidl PRIVATE src "${AIDL}" "${GEN}" "${BASE}/include" upstream/fmtlib/include upstream/json)
target_compile_definitions(aidl PRIVATE FMT_HEADER_ONLY)
target_compile_options(aidl PRIVATE -fwasm-exceptions -ffunction-sections -fdata-sections)
target_link_options(aidl PRIVATE -O3 --no-entry -fwasm-exceptions -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 "-sEXPORTED_FUNCTIONS=['_aidl_parse','_aidl_free','_malloc','_free']" "-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToUTF8','lengthBytesUTF8']" -sENVIRONMENT=web,worker,node)
if(AIDL_PROFILE)
  target_link_options(aidl PRIVATE --profiling-funcs)
  set_source_files_properties(src/wasm_api.cpp PROPERTIES COMPILE_DEFINITIONS AIDL_PROFILE)
  set(AIDL_OUTPUT wasm-profile)
else()
  set(AIDL_OUTPUT wasm)
endif()
set_target_properties(aidl PROPERTIES SUFFIX ".mjs" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build/${AIDL_OUTPUT}")
