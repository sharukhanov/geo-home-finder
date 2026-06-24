import { attractionPoints, zones, type AttractionPoint, type InsertAttractionPoint, type Zone, type InsertZone } from "@shared/schema";

export interface IStorage {
  // Attraction Points
  getAttractionPoints(userId: string): Promise<AttractionPoint[]>;
  getAttractionPoint(id: number): Promise<AttractionPoint | undefined>;
  createAttractionPoint(point: InsertAttractionPoint): Promise<AttractionPoint>;
  deleteAttractionPoint(id: number): Promise<boolean>;
  
  // Zones
  getZones(userId: string): Promise<Zone[]>;
  createZone(zone: InsertZone): Promise<Zone>;
  deleteZonesForUser(userId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private attractionPoints: Map<number, AttractionPoint>;
  private zones: Map<number, Zone>;
  private currentPointId: number;
  private currentZoneId: number;

  constructor() {
    this.attractionPoints = new Map();
    this.zones = new Map();
    this.currentPointId = 1;
    this.currentZoneId = 1;
  }

  async getAttractionPoints(userId: string): Promise<AttractionPoint[]> {
    return Array.from(this.attractionPoints.values()).filter(
      (point) => point.userId === userId,
    );
  }

  async getAttractionPoint(id: number): Promise<AttractionPoint | undefined> {
    return this.attractionPoints.get(id);
  }

  async createAttractionPoint(insertPoint: InsertAttractionPoint): Promise<AttractionPoint> {
    const id = this.currentPointId++;
    const point: AttractionPoint = {
      ...insertPoint,
      id,
      createdAt: new Date(),
    };
    this.attractionPoints.set(id, point);
    return point;
  }

  async deleteAttractionPoint(id: number): Promise<boolean> {
    return this.attractionPoints.delete(id);
  }

  async getZones(userId: string): Promise<Zone[]> {
    return Array.from(this.zones.values()).filter(
      (zone) => zone.userId === userId,
    );
  }

  async createZone(insertZone: InsertZone): Promise<Zone> {
    const id = this.currentZoneId++;
    const zone: Zone = {
      ...insertZone,
      id,
      createdAt: new Date(),
      pointId: insertZone.pointId ?? null,
    };
    this.zones.set(id, zone);
    return zone;
  }

  async deleteZonesForUser(userId: string): Promise<void> {
    const zonesToDelete = Array.from(this.zones.entries()).filter(
      ([_, zone]) => zone.userId === userId,
    );
    
    zonesToDelete.forEach(([id]) => {
      this.zones.delete(id);
    });
  }
}

export const storage = new MemStorage();
