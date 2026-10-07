const express = require("express");
const prisma = require("../prisma/client");
const router = express.Router();
const { authenticate } = require("../middleware/auth");

router.get("/", authenticate, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 50);

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId: req.user.id, readAt: null },
      }),
    ]);

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Notification list error:", error);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.get("/unread-count", authenticate, async (req, res) => {
  try {
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, readAt: null },
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error("Notification unread count error:", error);
    res.status(500).json({ error: "Failed to load notification count" });
  }
});

router.patch("/read-all", authenticate, async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ success: true, updated: result.count });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const updated = notification.readAt
      ? notification
      : await prisma.notification.update({
          where: { id: notification.id },
          data: { readAt: new Date() },
        });

    res.json({ notification: updated });
  } catch (error) {
    console.error("Mark notification read error:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.post("/push/subscribe", authenticate, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid push subscription" });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: req.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      create: {
        userId: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Push subscription error:", error);
    res.status(500).json({ error: "Failed to save push subscription" });
  }
});

router.post("/push/unsubscribe", authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    res.status(500).json({ error: "Failed to remove push subscription" });
  }
});

module.exports = router;
