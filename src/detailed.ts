import { Connection, PublicKey } from '@solana/web3.js';
import { performance } from 'perf_hooks';

// 检测每部分代码的性能
export class PerformanceMonitor {
  private startTime: number = 0;
  private endTime: number = 0;
  private markers: Map<string, {start: number, end?: number}> = new Map();
  
  start(): void {
    this.startTime = performance.now();
  }
  
  end(): void {
    this.endTime = performance.now();
  }
  
  markStart(name: string): void {
    this.markers.set(name, { start: performance.now() });
  }
  
  markEnd(name: string): void {
    const marker = this.markers.get(name);
    if (marker) {
      marker.end = performance.now();
    }
  }
  
  getExecutionTime(): number {
    return this.endTime - this.startTime;
  }
  
  getMarkerTime(name: string): number | undefined {
    const marker = this.markers.get(name);
    if (marker && marker.end) {
      return marker.end - marker.start;
    }
    return undefined;
  }
  
  getAllMarkers(): {[key: string]: number} {
    const result: {[key: string]: number} = {};
    this.markers.forEach((value, key) => {
      if (value.end) {
        result[key] = value.end - value.start;
      }
    });
    return result;
  }
  
  printReport(): void {
    console.log(`总执行时间: ${this.getExecutionTime().toFixed(2)}ms`);
    console.log('各阶段执行时间:');
    this.markers.forEach((value, key) => {
      if (value.end) {
        console.log(`  ${key}: ${(value.end - value.start).toFixed(2)}ms`);
      }
    });
  }
}