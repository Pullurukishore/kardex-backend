"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const fsaController_1 = require("../controllers/fsaController");
const router = express_1.default.Router();
// FSA Routes (Admin only)
router.get('/fsa', (0, auth_1.authMiddleware)(['ADMIN']), fsaController_1.getFSADashboard);
router.post('/fsa/export', (0, auth_1.authMiddleware)(['ADMIN']), fsaController_1.exportFSAData);
// Zone Users Routes (Admin only)
router.get('/zone-users', (0, auth_1.authMiddleware)(['ADMIN']), async (req, res) => {
    try {
        const { page = 1, search = '', limit = 10 } = req.query;
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);
        const where = {
            role: { in: ['ZONE_USER', 'SERVICE_PERSON'] }
        };
        if (search) {
            where.OR = [
                { email: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } }
            ];
        }
        const [zoneUsers, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take,
                include: {
                    serviceZones: {
                        include: {
                            serviceZone: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.user.count({ where })
        ]);
        const totalPages = Math.ceil(total / take);
        res.json({
            success: true,
            data: {
                zoneUsers: zoneUsers.map((user) => ({
                    ...user,
                    id: user.id.toString()
                })),
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalItems: total,
                    itemsPerPage: take
                },
                stats: {
                    totalUsers: total,
                    activeUsers: zoneUsers.filter((u) => u.isActive).length,
                    inactiveUsers: zoneUsers.filter((u) => !u.isActive).length
                }
            }
        });
    }
    catch (error) {
        console.error('Error fetching zone users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch zone users'
        });
    }
});
exports.default = router;
