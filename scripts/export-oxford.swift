import CoreServices
import Foundation

private let dictionaryName = "牛津英汉汉英词典"
private let tolerantSearch = CommandLine.arguments.contains("--tolerant")

@_silgen_name("DCSCopyAvailableDictionaries")
private func copyAvailableDictionaries() -> Unmanaged<CFSet>?

@_silgen_name("DCSDictionaryGetName")
private func getDictionaryName(_ dictionary: UnsafeRawPointer) -> Unmanaged<CFString>?

@_silgen_name("DCSCopyRecordsForSearchString")
private func copyRecords(
  _ dictionary: UnsafeRawPointer,
  _ text: CFString,
  _ options: Int,
  _ maxRecords: Int
) -> Unmanaged<CFArray>?

@_silgen_name("DCSRecordGetHeadword")
private func getRecordHeadword(_ record: UnsafeRawPointer) -> Unmanaged<CFString>?

@_silgen_name("DCSRecordGetRawHeadword")
private func getRecordRawHeadword(_ record: UnsafeRawPointer) -> Unmanaged<CFString>?

@_silgen_name("DCSRecordGetTitle")
private func getRecordTitle(_ record: UnsafeRawPointer) -> Unmanaged<CFString>?

@_silgen_name("DCSRecordGetAnchor")
private func getRecordAnchor(_ record: UnsafeRawPointer) -> Unmanaged<CFString>?

@_silgen_name("DCSRecordCopyData")
private func copyRecordData(_ record: UnsafeRawPointer, _ version: Int) -> Unmanaged<CFString>?

private func dictionary() throws -> UnsafeRawPointer {
  guard let set = copyAvailableDictionaries()?.takeRetainedValue() else {
    throw ExportError("DictionaryServices did not return any dictionaries.")
  }
  var values = [UnsafeRawPointer?](repeating: nil, count: CFSetGetCount(set))
  values.withUnsafeMutableBufferPointer { buffer in
    CFSetGetValues(set, buffer.baseAddress)
  }
  guard let match = values.compactMap({ $0 }).first(where: { value in
    getDictionaryName(value)?.takeUnretainedValue() as String? == dictionaryName
  }) else {
    throw ExportError("Required dictionary is not installed: \(dictionaryName)")
  }
  return match
}

private struct ExportError: Error, CustomStringConvertible {
  let description: String

  init(_ description: String) {
    self.description = description
  }
}

private func string(_ value: Unmanaged<CFString>?) -> String {
  value?.takeUnretainedValue() as String? ?? ""
}

private func copiedString(_ value: Unmanaged<CFString>?) -> String {
  value?.takeRetainedValue() as String? ?? ""
}

private func sourceId(from html: String) -> String {
  guard let match = html.range(of: #"<d:entry id="([^"]+)""#, options: .regularExpression) else {
    return ""
  }
  let token = String(html[match])
  return token
    .replacingOccurrences(of: #"<d:entry id=""#, with: "")
    .replacingOccurrences(of: #"""#, with: "")
}

private func englishRecord(_ record: UnsafeRawPointer) -> [String: Any]? {
  let html = copiedString(copyRecordData(record, 0))
  let id = sourceId(from: html)
  guard id.hasPrefix("e_") else { return nil }
  return [
    "sourceId": id,
    "headword": string(getRecordHeadword(record)),
    "rawHeadword": string(getRecordRawHeadword(record)),
    "title": string(getRecordTitle(record)),
    "anchor": string(getRecordAnchor(record)),
    "text": copiedString(copyRecordData(record, 3)),
    "html": html,
  ]
}

private func export(query: String, from dictionary: UnsafeRawPointer) -> [String: Any] {
  guard let records = copyRecords(
    dictionary,
    query as CFString,
    tolerantSearch ? 2 : 0,
    tolerantSearch ? 64 : 0
  )?.takeRetainedValue() else {
    return ["query": query, "records": []]
  }
  var exported: [[String: Any]] = []
  var seenIds = Set<String>()
  for index in 0..<CFArrayGetCount(records) {
    guard let pointer = CFArrayGetValueAtIndex(records, index),
          let record = englishRecord(pointer),
          let id = record["sourceId"] as? String,
          seenIds.insert(id).inserted else { continue }
    exported.append(record)
  }
  return ["query": query, "records": exported]
}

private func inputWords() throws -> [String] {
  let positionalArguments = CommandLine.arguments.dropFirst().filter { !$0.hasPrefix("--") }
  if let path = positionalArguments.first {
    return try String(contentsOfFile: path, encoding: .utf8)
      .split(whereSeparator: \ .isNewline)
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }
  let data = FileHandle.standardInput.readDataToEndOfFile()
  guard let text = String(data: data, encoding: .utf8) else {
    throw ExportError("Input must be UTF-8 text with one headword per line.")
  }
  return text
    .split(whereSeparator: \ .isNewline)
    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    .filter { !$0.isEmpty }
}

do {
  let selectedDictionary = try dictionary()
  for query in try inputWords() {
    try autoreleasepool {
      let data = try JSONSerialization.data(withJSONObject: export(
        query: query,
        from: selectedDictionary
      ))
      FileHandle.standardOutput.write(data)
      FileHandle.standardOutput.write(Data([0x0a]))
    }
  }
} catch {
  FileHandle.standardError.write(Data("Oxford export failed: \(error)\n".utf8))
  exit(1)
}