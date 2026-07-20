/**
 * Analysis Module Registry
 * 
 * Central barrel file that exports all analysis modules.
 * Adding a new analysis check is as simple as:
 * 1. Create the module in this directory
 * 2. Export it here
 * 3. Add it to the pipeline in the worker
 */
export { analyzeBlur } from './blurDetection';
export { analyzeBrightness } from './brightnessAnalysis';
export { analyzeDuplicate } from './duplicateDetection';
export { analyzeOCR } from './ocrExtraction';
export { validateNumberPlate } from './numberPlateValidation';
export { analyzeDimensions } from './dimensionValidation';
export { analyzeScreenshot } from './screenshotDetection';
export { analyzePhotoOfPhoto } from './photoOfPhotoDetection';
export { analyzeExif } from './exifAnalysis';
export { analyzeTampering } from './tamperingDetection';
