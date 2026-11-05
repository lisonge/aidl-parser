#include "bridge.h"
#include "generated/wire.h"
#include "profile.h"
#include "writer.h"
#include "parser.h"
#include <cstdlib>
#include <cstring>
#include <stdexcept>

Json location_json(const AidlLocation& location) {
  if (!location.LocationKnown() || location.IsInternal()) return nullptr;
  return Json::array({location.Begin().line, location.Begin().column, location.End().line, location.End().column});
}
void location(Writer& out, const AidlLocation& p) {
  if (!p.LocationKnown() || p.IsInternal()) throw std::logic_error("Missing source location for AIDL AST node");
  out.key("p"); out.array();
  out.value(p.Begin().line); out.value(p.Begin().column); out.value(p.End().line); out.value(p.End().column);
  out.end();
}
void base(Writer& out, const AidlNode& node, int kind) {
  out.object(); out.key("k"); out.value(kind); location(out, node.GetLocation());
  if (!node.GetComments().empty()) {
    out.key("c"); out.array();
    for (const auto& comment : node.GetComments()) out.value(comment.body);
    out.end();
  }
}
void expression(Writer& out, const AidlConstantValue& value);
void annotations(Writer& out, const AidlAnnotatable& node) {
  if (node.GetAnnotations().empty()) return;
  out.key("a"); out.array();
  for (const auto& annotation : node.GetAnnotations()) {
    out.object(); out.field("n", annotation->GetName());
    location(out, annotation->GetLocation());
    out.key("ps"); out.object();
    for (const auto& [key, value] : annotation->Parameters()) { out.key(key); expression(out, *value); }
    out.end(); out.end();
  }
  out.end();
}
void expression(Writer& out, const AidlConstantValue& value) {
  auto binary = dynamic_cast<const AidlBinaryConstExpression*>(&value);
  auto unary = dynamic_cast<const AidlUnaryConstExpression*>(&value);
  auto reference = dynamic_cast<const AidlConstantReference*>(&value);
  bool array = value.GetType() == AidlConstantValue::Type::ARRAY;
  base(out, value, binary ? wire::k_binary : unary ? wire::k_unary : reference ? wire::k_reference : array ? wire::k_array : wire::k_literal);
  out.field("l", value.Literal());
  if (binary) {
    out.field("o", binary->Op()); out.key("x"); expression(out, *binary->Left()); out.key("y"); expression(out, *binary->Right());
  } else if (unary) {
    out.field("o", unary->Op()); out.key("u"); expression(out, *unary->Val());
  } else if (reference) out.field("n", reference->Literal());
  else if (array && value.Size()) {
    out.key("e"); out.array();
    for (size_t i = 0; i < value.Size(); i++) expression(out, value.ValueAt(i));
    out.end();
  }
  out.end();
}
void type_json(Writer& out, const AidlTypeSpecifier& type) {
  base(out, type, wire::k_type); out.field("n", type.GetUnresolvedName()); annotations(out, type);
  if (type.IsGeneric()) {
    out.key("g"); out.array();
    for (const auto& arg : type.GetTypeParameters()) type_json(out, *arg);
    out.end();
  }
  if (type.IsArray()) {
    out.key("ar"); out.object(); out.key("k");
    if (auto fixed = std::get_if<FixedSizeArray>(&type.GetArray())) {
      out.value(wire::k_fixed); out.key("ds"); out.array();
      for (const auto& dim : fixed->dimensions) expression(out, *dim);
      out.end();
    } else out.value(wire::k_dynamic);
    out.end();
  }
  out.end();
}
void declaration(Writer& out, const AidlDefinedType& type);
void member(Writer& out, const AidlMember& value) {
  if (auto type = dynamic_cast<const AidlDefinedType*>(&value)) { declaration(out, *type); return; }
  auto method = dynamic_cast<const AidlMethod*>(&value);
  auto constant = dynamic_cast<const AidlConstantDeclaration*>(&value);
  base(out, value, method ? wire::k_method : constant ? wire::k_constant : wire::k_field);
  annotations(out, value);
  if (method) {
    out.field("n", method->GetName()); out.key("r"); type_json(out, method->GetType());
    out.flag("w", method->IsOneway());
    if (method->HasId()) { out.key("i"); out.value(method->GetId()); }
    if (!method->GetArguments().empty()) {
      out.key("ps"); out.array();
      for (const auto& arg : method->GetArguments()) {
        base(out, *arg, wire::k_parameter); out.field("n", arg->GetName()); out.key("t"); type_json(out, arg->GetType());
        const auto direction = arg->GetDirectionSpecifier();
        out.key("d"); out.value(direction == "in" ? wire::d_in : direction == "out" ? wire::d_out : direction == "inout" ? wire::d_inout : wire::d_unspecified);
        annotations(out, *arg); out.end();
      }
      out.end();
    }
  } else if (constant) {
    out.field("n", constant->GetName()); out.key("t"); type_json(out, constant->GetType()); out.key("v"); expression(out, constant->GetValue());
  } else if (auto field = dynamic_cast<const AidlVariableDeclaration*>(&value)) {
    out.field("n", field->GetName()); out.key("t"); type_json(out, field->GetType());
    if (field->IsDefaultUserSpecified() && field->GetDefaultValue()) { out.key("dv"); expression(out, *field->GetDefaultValue()); }
  }
  out.end();
}
void declaration(Writer& out, const AidlDefinedType& type) {
  const auto kind = type.GetPreprocessDeclarationName();
  base(out, type, kind == "interface" ? wire::k_interface : kind == "union" ? wire::k_union : kind == "enum" ? wire::k_enum : wire::k_parcelable);
  out.field("n", type.GetName()); annotations(out, type);
  if (!type.GetMembers().empty()) {
    out.key("m"); out.array();
    for (const auto* item : type.GetMembers()) member(out, *item);
    out.end();
  }
  if (auto iface = dynamic_cast<const AidlInterface*>(&type)) out.flag("w", iface->HasOnewayAnnotation());
  if (auto parcelable = dynamic_cast<const AidlParcelable*>(&type)) {
    out.flag("f", kind == "parcelable");
    if (parcelable->IsGeneric()) {
      out.key("tp"); out.array();
      for (const auto& p : parcelable->GetTypeParameters()) out.value(p->GetName());
      out.end();
    }
    out.field("ch", parcelable->GetCppHeader()); out.field("nh", parcelable->GetNdkHeader()); out.field("rt", parcelable->GetRustType());
  }
  if (auto enumeration = dynamic_cast<const AidlEnumDeclaration*>(&type)) {
    out.key("es"); out.array();
    for (const auto& value : enumeration->GetEnumerators()) {
      base(out, *value, wire::k_enumerator); out.field("n", value->GetName());
      if (value->IsValueUserSpecified() && value->GetValue()) { out.key("v"); expression(out, *value->GetValue()); }
      out.end();
    }
    out.end();
  }
  out.end();
}
extern "C" char* aidl_parse(const char* source, const char* filename) {
  diagnostics = Json::array(); AidlErrorLog::clearError();
  Writer out;
  out.object(); out.key("version"); out.value(wire::version);
  try {
    PROFILE_BEGIN;
    auto document = Parser::ParseSource(filename, source);
    PROFILE_END(0);
    if (document && !AidlErrorLog::hadError()) {
      out.key("doc"); base(out, *document, wire::k_document);
      if (!document->Imports().empty()) {
        out.key("im"); out.array();
        for (const auto& import : document->Imports()) out.value(import);
        out.end();
      }
      if (!document->DefinedTypes().empty()) out.field("pk", document->DefinedTypes().front()->GetPackage());
      out.key("dc"); out.array();
      for (const auto& type : document->DefinedTypes()) declaration(out, *type);
      out.end(); out.end();
    }
    PROFILE_END(1);
    document.reset(); AidlNode::ClearUnvisitedNodes();
    PROFILE_END(2);
    if (!diagnostics.empty()) { out.key("dg"); out.raw(diagnostics); }
    out.end();
  } catch (const std::exception& error) {
    AidlNode::ClearUnvisitedNodes();
    out = Writer(); out.object(); out.key("version"); out.value(wire::version); out.field("err", error.what()); out.end();
  }
  PROFILE_BEGIN;
  auto result = static_cast<char*>(std::malloc(out.text.size() + 1));
  std::memcpy(result, out.text.c_str(), out.text.size() + 1);
  PROFILE_END(3);
  return result;
}
extern "C" void aidl_free(void* pointer) { std::free(pointer); }
