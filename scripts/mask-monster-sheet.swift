import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct Anchor: Decodable {
    let x: Int
    let y: Int
}

struct MaskConfiguration: Decodable {
    let alphaThreshold: Int?
    let padding: Int?
    let anchors: [String: Anchor]
}

struct Component {
    let id: Int32
    let count: Int
    let centerX: Double
    let centerY: Double
}

let poseNames = ["aloof", "challenge", "vanquished", "triumphant"]
let arguments = CommandLine.arguments

guard arguments.count == 5,
      let canvasSize = Int(arguments[3]),
      canvasSize > 0,
      let configurationData = arguments[4].data(using: .utf8) else {
    FileHandle.standardError.write(Data(
        "Usage: swift mask-monster-sheet.swift <source.png> <output-dir> <canvas-size> <mask-json>\n".utf8
    ))
    exit(1)
}

let sourceURL = URL(fileURLWithPath: arguments[1])
let outputDirectory = URL(fileURLWithPath: arguments[2], isDirectory: true)
let configuration: MaskConfiguration

do {
    configuration = try JSONDecoder().decode(MaskConfiguration.self, from: configurationData)
    try FileManager.default.createDirectory(
        at: outputDirectory,
        withIntermediateDirectories: true
    )
} catch {
    FileHandle.standardError.write(Data("Invalid mask configuration: \(error)\n".utf8))
    exit(1)
}

let alphaThreshold = UInt8(clamping: configuration.alphaThreshold ?? 4)
let padding = max(0, configuration.padding ?? 12)

guard alphaThreshold > 0,
      poseNames.allSatisfy({ configuration.anchors[$0] != nil }),
      let imageSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let sourceImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
    FileHandle.standardError.write(Data("Mask configuration needs four anchors and a readable source image.\n".utf8))
    exit(1)
}

let width = sourceImage.width
let height = sourceImage.height
let pixelCount = width * height
let sourceBytesPerRow = width * 4
let sourceByteCount = sourceBytesPerRow * height
let colorSpace = CGColorSpaceCreateDeviceRGB()
let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue
    | CGImageAlphaInfo.premultipliedLast.rawValue

guard let sourcePixels = calloc(sourceByteCount, 1),
      let sourceContext = CGContext(
          data: sourcePixels,
          width: width,
          height: height,
          bitsPerComponent: 8,
          bytesPerRow: sourceBytesPerRow,
          space: colorSpace,
          bitmapInfo: bitmapInfo
      ) else {
    FileHandle.standardError.write(Data("Unable to allocate source image buffer.\n".utf8))
    exit(1)
}
defer { free(sourcePixels) }

sourceContext.interpolationQuality = .none
sourceContext.setBlendMode(.copy)
sourceContext.draw(sourceImage, in: CGRect(x: 0, y: 0, width: width, height: height))

let sourceBytes = sourcePixels.assumingMemoryBound(to: UInt8.self)
var componentByPixel = [Int32](repeating: -1, count: pixelCount)
var components: [Component] = []
var queue: [Int] = []
queue.reserveCapacity(pixelCount)

func isForeground(_ pixel: Int) -> Bool {
    sourceBytes[(pixel * 4) + 3] >= alphaThreshold
}

for start in 0..<pixelCount where isForeground(start) && componentByPixel[start] == -1 {
    let componentId = Int32(components.count)
    queue.removeAll(keepingCapacity: true)
    queue.append(start)
    componentByPixel[start] = componentId
    var head = 0
    var count = 0
    var sumX = 0
    var sumY = 0

    while head < queue.count {
        let current = queue[head]
        head += 1
        let x = current % width
        let y = current / width
        count += 1
        sumX += x
        sumY += y

        for deltaY in -1...1 {
            for deltaX in -1...1 where deltaX != 0 || deltaY != 0 {
                let nextX = x + deltaX
                let nextY = y + deltaY
                guard nextX >= 0, nextX < width, nextY >= 0, nextY < height else { continue }
                let next = (nextY * width) + nextX
                if isForeground(next) && componentByPixel[next] == -1 {
                    componentByPixel[next] = componentId
                    queue.append(next)
                }
            }
        }
    }

    components.append(Component(
        id: componentId,
        count: count,
        centerX: Double(sumX) / Double(count),
        centerY: Double(sumY) / Double(count)
    ))
}

let mainComponents = components.sorted { $0.count > $1.count }.prefix(poseNames.count)
guard mainComponents.count == poseNames.count else {
    FileHandle.standardError.write(Data("The sheet does not contain four disconnected foreground subjects.\n".utf8))
    exit(1)
}

var availableComponents = Array(mainComponents)
var componentForPose: [String: Component] = [:]

for poseName in poseNames {
    let anchor = configuration.anchors[poseName]!
    guard let nearestIndex = availableComponents.indices.min(by: { left, right in
        let leftComponent = availableComponents[left]
        let rightComponent = availableComponents[right]
        let leftDistance = pow(leftComponent.centerX - Double(anchor.x), 2)
            + pow(leftComponent.centerY - Double(anchor.y), 2)
        let rightDistance = pow(rightComponent.centerX - Double(anchor.x), 2)
            + pow(rightComponent.centerY - Double(anchor.y), 2)
        return leftDistance < rightDistance
    }) else {
        FileHandle.standardError.write(Data("Unable to match mask anchor for \(poseName).\n".utf8))
        exit(1)
    }
    componentForPose[poseName] = availableComponents.remove(at: nearestIndex)
}

// Seed a multi-source flood fill with the four main subjects. Every detached
// droplet, shadow, and accessory is then owned by the closest subject without
// introducing an artificial straight crop boundary.
var owner = [Int8](repeating: -1, count: pixelCount)
queue.removeAll(keepingCapacity: true)

for (poseIndex, poseName) in poseNames.enumerated() {
    let componentId = componentForPose[poseName]!.id
    for pixel in 0..<pixelCount where componentByPixel[pixel] == componentId {
        owner[pixel] = Int8(poseIndex)
        queue.append(pixel)
    }
}

var head = 0
while head < queue.count {
    let current = queue[head]
    head += 1
    let x = current % width
    let y = current / width
    let currentOwner = owner[current]

    for deltaY in -1...1 {
        for deltaX in -1...1 where deltaX != 0 || deltaY != 0 {
            let nextX = x + deltaX
            let nextY = y + deltaY
            guard nextX >= 0, nextX < width, nextY >= 0, nextY < height else { continue }
            let next = (nextY * width) + nextX
            if owner[next] == -1 {
                owner[next] = currentOwner
                queue.append(next)
            }
        }
    }
}

for (poseIndex, poseName) in poseNames.enumerated() {
    let expectedOwner = Int8(poseIndex)
    var minX = width
    var minY = height
    var maxX = -1
    var maxY = -1
    var ownedPixelCount = 0

    for pixel in 0..<pixelCount where isForeground(pixel) && owner[pixel] == expectedOwner {
        let x = pixel % width
        let y = pixel / width
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
        ownedPixelCount += 1
    }

    guard maxX >= minX, maxY >= minY else {
        FileHandle.standardError.write(Data("Mask for \(poseName) is empty.\n".utf8))
        exit(1)
    }

    minX = max(0, minX - padding)
    minY = max(0, minY - padding)
    maxX = min(width - 1, maxX + padding)
    maxY = min(height - 1, maxY + padding)
    let cropWidth = maxX - minX + 1
    let cropHeight = maxY - minY + 1
    let cropBytesPerRow = cropWidth * 4
    let cropByteCount = cropBytesPerRow * cropHeight

    guard let cropPixels = calloc(cropByteCount, 1) else {
        FileHandle.standardError.write(Data("Unable to allocate crop for \(poseName).\n".utf8))
        exit(1)
    }
    defer { free(cropPixels) }
    let cropBytes = cropPixels.assumingMemoryBound(to: UInt8.self)

    for sourceY in minY...maxY {
        for sourceX in minX...maxX {
            let sourcePixel = (sourceY * width) + sourceX
            guard isForeground(sourcePixel), owner[sourcePixel] == expectedOwner else { continue }
            let destinationPixel = ((sourceY - minY) * cropWidth) + (sourceX - minX)
            let sourceOffset = sourcePixel * 4
            let destinationOffset = destinationPixel * 4
            cropBytes[destinationOffset] = sourceBytes[sourceOffset]
            cropBytes[destinationOffset + 1] = sourceBytes[sourceOffset + 1]
            cropBytes[destinationOffset + 2] = sourceBytes[sourceOffset + 2]
            cropBytes[destinationOffset + 3] = sourceBytes[sourceOffset + 3]
        }
    }

    guard let cropContext = CGContext(
        data: cropPixels,
        width: cropWidth,
        height: cropHeight,
        bitsPerComponent: 8,
        bytesPerRow: cropBytesPerRow,
        space: colorSpace,
        bitmapInfo: bitmapInfo
    ), let cropImage = cropContext.makeImage() else {
        FileHandle.standardError.write(Data("Unable to render crop for \(poseName).\n".utf8))
        exit(1)
    }

    let outputBytesPerRow = canvasSize * 4
    let outputByteCount = outputBytesPerRow * canvasSize
    guard let outputPixels = calloc(outputByteCount, 1) else {
        FileHandle.standardError.write(Data("Unable to allocate output for \(poseName).\n".utf8))
        exit(1)
    }
    defer { free(outputPixels) }

    guard let outputContext = CGContext(
        data: outputPixels,
        width: canvasSize,
        height: canvasSize,
        bitsPerComponent: 8,
        bytesPerRow: outputBytesPerRow,
        space: colorSpace,
        bitmapInfo: bitmapInfo
    ) else {
        FileHandle.standardError.write(Data("Unable to create output context for \(poseName).\n".utf8))
        exit(1)
    }

    let scale = min(
        1,
        min(
            CGFloat(canvasSize) / CGFloat(cropWidth),
            CGFloat(canvasSize) / CGFloat(cropHeight)
        )
    )
    let drawWidth = CGFloat(cropWidth) * scale
    let drawHeight = CGFloat(cropHeight) * scale
    let drawRect = CGRect(
        x: (CGFloat(canvasSize) - drawWidth) / 2,
        y: (CGFloat(canvasSize) - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight
    )

    outputContext.interpolationQuality = .high
    outputContext.setBlendMode(.copy)
    outputContext.draw(cropImage, in: drawRect)

    guard let outputImage = outputContext.makeImage() else {
        FileHandle.standardError.write(Data("Unable to finalize \(poseName).\n".utf8))
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

    print("\(poseName): \(ownedPixelCount) px, crop \(cropWidth)x\(cropHeight)")
}