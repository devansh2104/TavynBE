const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('./auth');
const router = express.Router();
const prisma = new PrismaClient();

// 12. Expense APIs
router.post('/', protect, async (req, res) => res.status(201).json(await prisma.expense.create({ data: req.body })));
router.get('/', protect, async (req, res) => res.json(await prisma.expense.findMany()));
router.get('/summary', protect, async (req, res) => res.json({ total: 5000 }));
router.put('/:id', protect, async (req, res) => res.json(await prisma.expense.update({where: {id: req.params.id}, data: req.body})));
router.delete('/:id', protect, async (req, res) => {
  await prisma.expense.delete({where: {id: req.params.id}});
  res.json({ message: 'Expense deleted' });
});
module.exports = router;
