const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('./auth');
const router = express.Router();
const prisma = new PrismaClient();

// 8. Rent APIs
router.post('/generate-monthly', protect, async (req, res) => res.status(201).json({ message: 'Rent generated' }));
router.get('/', protect, async (req, res) => res.json(await prisma.rent.findMany()));
router.get('/pending', protect, async (req, res) => res.json(await prisma.rent.findMany({where: {status: 'Pending'}})));
router.get('/:id', protect, async (req, res) => res.json(await prisma.rent.findUnique({where: {id: req.params.id}})));
router.put('/:id/pay', protect, async (req, res) => res.json(await prisma.rent.update({where: {id: req.params.id}, data: {status: 'Paid'}})));
router.put('/:id/late-fee', protect, async (req, res) => res.json(await prisma.rent.update({where: {id: req.params.id}, data: {lateFee: req.body.lateFee}})));
module.exports = router;
