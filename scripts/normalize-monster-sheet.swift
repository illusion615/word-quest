import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct CropRegion: Decodable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
}

let poseNames = ["aloof", "challenge", "vanquished", "triumphant"]
let arguments = CommandLine.arguments

guard arguments.count == 6,
      let canvasSize = Int(arguments[3]),
      let alphaThreshold = UInt8(arguments[4]),
      canvasSize > 0,
      let cropData = arguments[5].data(using: .utf8) else {
    FileHandle.standardError.write(Data(
        "Usage: swift normalize-monster-sheet.swift <source.png> <output-dir> <canvas-size> <alpha-threshold> <crop-json>\n".utf8
    ))
    exit(1)
}

let sourceURL = URL(fileURLWithPath: arguments[1])
let outputDirectory = URL(fileURLWithPath: arguments[2], isDirectory: true)
let crops: [String: CropRegion]

do {
    crops = try JSONDecoder().decode([String: CropRegion].self, from: cropData)
    try FileManager.default.createDirectory(
        at: outputDirectory,
        withIntermediateDirectories: true
    )
} catch {
    FileHandle.standardError.write(Data("Invalid crop configuration: \(error)\n".utf8))
    exit(1)
}

guard let imageSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let sourceImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
    FileHandle.standardError.write(Data("Unable to read source image.\n".utf8))
    exit(1)
}

let bytesPerRow = canvasSize * 4
let byteCount = bytesPerRow * canvasSize
let colorSpace = CGColorSpaceCreateDeviceRGB()

for poseName in poseNames {
    guard let crop = crops[poseName],
          crop.x >= 0,
          crop.y >= 0,
          crop.width > 0,
          crop.height > 0,
          crop.x + crop.width <= sourceImage.width,
          crop.y + crop.height <= sourceImage.height,
          let croppedImage = sourceImage.cropping(to: CGRect(
              x: crop.x,
              y: crop.y,
              width: crop.width,
              height: crop.height
          )) else {
        FileHandle.standardError.write(Data("Invalid crop for \(poseName).\n".utf8))
        exit(1)
    }

    guard let pixels = calloc(byteCount, 1) else {
        FileHandle.standardError.write(Data("Unable to allocate image buffer.\n".utf8))
        exit(1)
    }
    defer { free(pixels) }

    let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue
        | CGImageAlphaInfo.premultipliedLast.rawValue
    guard let context = CGContext(
        data: pixels,
        width: canvasSize,
        height: canvasSize,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: colorSpace,
        bitmapInfo: bitmapInfo
    ) else {
        FileHandle.standardError.write(Data("Unable to create image context.\n".utf8))
        exit(1)
    }

    let scale = min(
        1,
        min(
            CGFloat(canvasSize) / CGFloat(crop.width),
            CGFloat(canvasSize) / CGFloat(crop.height)
        )
    )
    let drawWidth = CGFloat(crop.width) * scale
    let drawHeight = CGFloat(crop.height) * scale
    let drawRect = CGRect(
        x: (CGFloat(canvasSize) - drawWidth) / 2,
        y: (CGFloat(canvasSize) - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight
    )

    context.interpolationQuality = .high
    context.setBlendMode(.copy)
    context.draw(croppedImage, in: drawRect)

    if alphaThreshold > 0 {
        let bytes = pixels.assumingMemoryBound(to: UInt8.self)
        for offset in stride(from: 0, to: byteCount, by: 4) where bytes[offset + 3] < alphaThreshold {
            bytes[offset] = 0
            bytes[offset + 1] = 0
            bytes[offset + 2] = 0
            bytes[offset + 3] = 0
        }
    }

    guard let outputImage = context.makeImage() else {
        FileHandle.standardError.write(Data("Unable to render \(poseName).\n".utf8))
        exit(1)
    }

    let outputURL = outputDirectory.appendingPathComponent("\(poseName).png")
    guard let destination = CGImageDestinationCreateWithURL(
        outputURL as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else {
        FileHandle.standardError.write(Data("Unable to create \(poseName) output.\n".utf8))
        exit(1)
    }

    CGImageDestinationAddImage(destination, outputImage, nil)
    guard CGImageDestinationFinalize(destination) else {
        FileHandle.standardError.write(Data("Unable to write \(poseName) output.\n".utf8))
        exit(1)
    }
}