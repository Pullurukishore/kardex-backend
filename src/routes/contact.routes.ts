import { Router } from 'express';
import { query, param, body } from 'express-validator';
import { 
  listContacts, 
  getContact, 
  createContact, 
  updateContact, 
  deleteContact 
} from '../controllers/contact.controller';
import { authenticate } from '../middleware/auth.middleware';
import { canManageContacts } from '../middleware/customer.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router({ mergeParams: true });

// Apply auth middleware to all routes
router.use(authenticate);

// Get all contacts for a customer with pagination and search
router.get(
  '/',
  [
    param('id').isInt().toInt().withMessage('Invalid customer ID'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    validateRequest
  ],
  listContacts
);

// Get contact by ID
router.get(
  '/:contactId',
  [
    param('id').isInt().toInt().withMessage('Invalid customer ID'),
    param('contactId').isInt().toInt().withMessage('Invalid contact ID'),
    validateRequest
  ],
  getContact
);

// Create a new contact for a customer
router.post(
  '/',
  [
    param('id').isInt().toInt().withMessage('Invalid customer ID'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('role').optional().isIn(['ACCOUNT_OWNER', 'CONTACT']).withMessage('Invalid role'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validateRequest
  ],
  canManageContacts,
  createContact
);

// Update a contact
router.put(
  '/:contactId',
  [
    param('id').isInt().toInt().withMessage('Invalid customer ID'),
    param('contactId').isInt().toInt().withMessage('Invalid contact ID'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('phone').optional().trim(),
    body('role').optional().isIn(['ACCOUNT_OWNER', 'CONTACT']).withMessage('Invalid role'),
    validateRequest
  ],
  canManageContacts,
  updateContact
);

// Delete a contact
router.delete(
  '/:contactId',
  [
    param('id').isInt().toInt().withMessage('Invalid customer ID'),
    param('contactId').isInt().toInt().withMessage('Invalid contact ID'),
    validateRequest
  ],
  canManageContacts,
  deleteContact
);

export default router;
