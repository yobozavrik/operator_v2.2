import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const rootDir = process.cwd();
    const logPath = path.join(rootDir, 'experiments.log');
    const modelPath = path.join(rootDir, 'model.json');

    let experiments = [];
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      experiments = content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(exp => exp !== null);
    }

    let modelInfo = null;
    if (fs.existsSync(modelPath)) {
      const stats = fs.statSync(modelPath);
      const content = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      
      const firstModel = content.isMultiModel ? Object.values(content.models)[0] : content;

      modelInfo = {
        last_updated: stats.mtime,
        isMultiModel: !!content.isMultiModel,
        architecture: {
          inputSize: content.inputSize || 9,
          hiddenSize: (firstModel as any)?.hiddenSize || 12
        },
        dowAccuracy: content.isMultiModel ? Object.fromEntries(
          Object.entries(content.models).map(([k, v]: [string, any]) => [k, v.rmse])
        ) : null
      };
    }

    return NextResponse.json({
      success: true,
      experiments: experiments.reverse(), // Newest first
      model: modelInfo
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
