const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('./auth');
const router = express.Router();
const prisma = new PrismaClient();

// 10. Payment APIs
router.post('/', protect, async (req, res) => {
  const payment = await prisma.payment.create({ data: req.body });
  res.status(201).json(payment);
});
router.get('/', protect, async (req, res) => res.json(await prisma.payment.findMany()));
router.get('/history/:tenantId', protect, async (req, res) => res.json(await prisma.payment.findMany({where: {tenantId: req.params.tenantId}})));
router.get('/:id', protect, async (req, res) => res.json(await prisma.payment.findUnique({where: {id: req.params.id}})));
module.exports = router;
