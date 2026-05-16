import { Results, NormalizedLandmarkList } from '@mediapipe/pose';

/**
 * poseLockService.ts
 * Ensures the system stays focused on a single user by tracking spatial continuity.
 * Prevents erratic tracking when multiple people are in the frame.
 */

export class PoseLockService {
  private lastCentroid: { x: number, y: number } | null = null;
  private isLocked = false;
  private readonly MOVEMENT_THRESHOLD = 0.25; // Max jump as % of screen (0.25 = 25%)
  private readonly LOCK_CONFIDENCE_THRESHOLD = 0.6;
  private readonly UNLOCK_TIME_THRESHOLD = 2000; // 2 seconds of missing pose to unlock
  private lastSeenTime = 0;

  /**
   * Evaluates if the current pose results belong to the "locked" user.
   * If not locked, it will lock onto the first high-confidence pose detected.
   */
  filter(results: Results): Results | null {
    if (!results.poseLandmarks) {
      if (Date.now() - this.lastSeenTime > this.UNLOCK_TIME_THRESHOLD) {
        this.reset();
      }
      return results;
    }

    const currentCentroid = this.calculateCentroid(results.poseLandmarks);
    const now = Date.now();

    // 1. Initial Locking
    if (!this.isLocked) {
      // Find a stable pose to lock onto
      const avgConfidence = this.calculateAvgConfidence(results.poseLandmarks);
      if (avgConfidence > this.LOCK_CONFIDENCE_THRESHOLD) {
        this.lastCentroid = currentCentroid;
        this.isLocked = true;
        this.lastSeenTime = now;
        console.log("[PoseLock] Locked onto user at:", currentCentroid);
        return results;
      }
      return null;
    }

    // 2. Continuity Check
    if (this.lastCentroid) {
      const distance = Math.sqrt(
        Math.pow(currentCentroid.x - this.lastCentroid.x, 2) +
        Math.pow(currentCentroid.y - this.lastCentroid.y, 2)
      );

      // If the pose jumped too far, it's likely a different person or a glitch
      if (distance > this.MOVEMENT_THRESHOLD) {
        // Check if the jump is sustained (maybe the user moved fast?)
        // For fitness, 25% of screen in < 50ms is almost always a different person
        console.warn("[PoseLock] Potential person switch detected. Ignoring frame. Distance:", distance.toFixed(3));
        return null;
      }
    }

    // 3. Update state
    this.lastCentroid = currentCentroid;
    this.lastSeenTime = now;
    return results;
  }

  reset() {
    this.isLocked = false;
    this.lastCentroid = null;
    this.lastSeenTime = 0;
    console.log("[PoseLock] Lock reset.");
  }

  private calculateCentroid(landmarks: NormalizedLandmarkList) {
    // We use shoulders and hips to calculate a stable center of gravity
    // Indices: 11, 12 (shoulders), 23, 24 (hips)
    const points = [11, 12, 23, 24];
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const i of points) {
      if (landmarks[i]) {
        sumX += landmarks[i].x;
        sumY += landmarks[i].y;
        count++;
      }
    }

    return count > 0 
      ? { x: sumX / count, y: sumY / count } 
      : { x: 0.5, y: 0.5 };
  }

  private calculateAvgConfidence(landmarks: NormalizedLandmarkList) {
    const points = [11, 12, 23, 24, 25, 26]; // Core joints
    let sum = 0;
    let count = 0;

    for (const i of points) {
      if (landmarks[i]) {
        sum += (landmarks[i] as any).visibility || 0;
        count++;
      }
    }

    return count > 0 ? sum / count : 0;
  }
}

export const poseLockService = new PoseLockService();
