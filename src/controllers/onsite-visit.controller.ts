import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { GeocodingService } from '../services/geocoding.service';

type OnsiteVisitEvent = 'STARTED' | 'REACHED' | 'ENDED' | 'REACHED_BACK';

type TypedRequest = Request & {
  user?: { id: number; role: string };
  body: {
    ticketId: number;
    latitude: number;
    longitude: number;
  };
};

async function createVisitLog(userId: number, ticketId: number, event: OnsiteVisitEvent, latitude: number, longitude: number) {
  const { address } = await GeocodingService.reverseGeocode(latitude, longitude);

  const log = await prisma.onsiteVisitLog.create({
    data: {
      ticketId,
      userId,
      event,
      latitude: latitude as unknown as any,
      longitude: longitude as unknown as any,
      address: address || undefined,
    },
  });

  return log;
}

export const startOnsiteVisit = async (req: TypedRequest, res: Response) => {
  try {
    const userId = req.user?.id as number;
    const { ticketId, latitude, longitude } = req.body;

    // Optional: ensure ticket exists
    const ticket = await prisma.ticket.findUnique({ where: { id: Number(ticketId) } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const log = await createVisitLog(userId, Number(ticketId), 'STARTED', Number(latitude), Number(longitude));
    return res.status(201).json(log);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to record onsite start' });
  }
};

export const reachOnsiteVisit = async (req: TypedRequest, res: Response) => {
  try {
    const userId = req.user?.id as number;
    const { ticketId, latitude, longitude } = req.body;

    const ticket = await prisma.ticket.findUnique({ where: { id: Number(ticketId) } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const log = await createVisitLog(userId, Number(ticketId), 'REACHED', Number(latitude), Number(longitude));
    return res.status(201).json(log);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to record onsite reached' });
  }
};

export const endOnsiteVisit = async (req: TypedRequest, res: Response) => {
  try {
    const userId = req.user?.id as number;
    const { ticketId, latitude, longitude } = req.body;

    const ticket = await prisma.ticket.findUnique({ where: { id: Number(ticketId) } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const log = await createVisitLog(userId, Number(ticketId), 'ENDED', Number(latitude), Number(longitude));
    return res.status(201).json(log);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to record onsite end' });
  }
};

export const backOnsiteVisit = async (req: TypedRequest, res: Response) => {
  try {
    const userId = req.user?.id as number;
    const { ticketId, latitude, longitude } = req.body;

    const ticket = await prisma.ticket.findUnique({ where: { id: Number(ticketId) } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const log = await createVisitLog(userId, Number(ticketId), 'REACHED_BACK', Number(latitude), Number(longitude));
    return res.status(201).json(log);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to record onsite reached back' });
  }
};


