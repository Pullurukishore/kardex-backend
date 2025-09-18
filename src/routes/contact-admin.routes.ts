import { Router, Response, Request } from 'express';
import { query, param, body } from 'express-validator';
import { 
  listAllContacts,
  getContactById,
  createContactAdmin,
  updateContactAdmin,
  deleteContactAdmin
} from '../controllers/contact.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get all contacts with pagination and search (Admin only)
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('customerId').optional().isInt().toInt(),
    validateRequest
  ],
  requireRole(['ADMIN']),
  listAllContacts
);

// Get contact by ID
router.get(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid contact ID'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  getContactById
);

// Create a new contact
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('customerId').isInt().toInt().withMessage('Valid customer ID is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('role').optional().isIn(['ACCOUNT_OWNER', 'CONTACT']).withMessage('Invalid role'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  createContactAdmin
);

// Update contact
router.put(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid contact ID'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('customerId').optional().isInt().toInt().withMessage('Valid customer ID is required'),
    body('phone').optional().trim(),
    body('role').optional().isIn(['ACCOUNT_OWNER', 'CONTACT']).withMessage('Invalid role'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  updateContactAdmin
);

// Delete contact
router.delete(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid contact ID'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  deleteContactAdmin
);

export default router;
