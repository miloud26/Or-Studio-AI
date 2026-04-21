import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import path from 'path';
import fs from 'fs-extra';
import { MontagePlan, ClipMetadata } from '../types.ts';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

export async function getMetadata(filePath: string): Promise<Partial<ClipMetadata>> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        fps: eval(videoStream?.avg_frame_rate || '30'),
        size: metadata.format.size || 0,
      });
    });
  });
}

export async function renderVideo(
  plan: MontagePlan,
  clips: ClipMetadata[],
  outputDir: string,
  onProgress: (progress: number) => void
): Promise<string> {
  const outputFilename = `final_ad_${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, outputFilename);
  await fs.ensureDir(outputDir);

  return new Promise((resolve, reject) => {
    let command = ffmpeg();

    // Input files (unique only to avoid redundant loading if same file used multiple times)
    const uniqueClipIds = Array.from(new Set(plan.timeline.map(t => t.clip_id)));
    uniqueClipIds.forEach((clipId) => {
      const clip = clips.find(c => c.id === clipId);
      if (!clip) throw new Error(`Clip ${clipId} not found in metadata`);
      command = command.input(clip.path);
    });

    const filterComplex: string[] = [];
    const videoInputs: string[] = [];
    const audioInputs: string[] = [];

    plan.timeline.forEach((item, index) => {
      const inputIndex = uniqueClipIds.indexOf(item.clip_id);
      const vLabel = `v${index}`;
      const aLabel = `a${index}`;
      
      // Basic trim, scale, and color/motion effects (simplified)
      // Note: Full zoom/color effects implementation in FFmpeg strings is complex, 
      // we'll stick to the core trim/scale/fps for now but prepare labels.
      
      filterComplex.push(
        `[${inputIndex}:v]trim=start=${item.start_seconds}:end=${item.end_seconds},setpts=PTS-STARTPTS,scale=${plan.render.width}:${plan.render.height}:force_original_aspect_ratio=decrease,pad=${plan.render.width}:${plan.render.height}:(ow-iw)/2:(oh-ih)/2,fps=${plan.render.fps}[${vLabel}]`
      );
      filterComplex.push(
        `[${inputIndex}:a]atrim=start=${item.start_seconds}:end=${item.end_seconds},asetpts=PTS-STARTPTS[${aLabel}]`
      );
      
      videoInputs.push(`[${vLabel}]`);
      audioInputs.push(`[${aLabel}]`);
    });

    // Concat all trimmed clips
    filterComplex.push(
      `${videoInputs.join('')}concat=n=${plan.timeline.length}:v=1:a=0[outv]`
    );
    filterComplex.push(
      `${audioInputs.join('')}concat=n=${plan.timeline.length}:v=0:a=1[outa]`
    );

    command
      .complexFilter(filterComplex)
      .map('[outv]')
      .map('[outa]')
      .videoCodec(plan.render.video_codec)
      .audioCodec(plan.render.audio_codec)
      .outputOptions([
        '-preset medium',
        '-crf 20',
        `-pix_fmt ${plan.render.pix_fmt}`
      ])
      .on('start', (cmd) => console.log('FFmpeg command:', cmd))
      .on('progress', (progress) => {
        if (progress.percent) onProgress(progress.percent);
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        reject(err);
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .save(outputPath);
  });
}
