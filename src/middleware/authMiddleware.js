import jwt from 'jsonwebtoken';
import prisma from '../../prismaClient.js'

async function authMiddleware(req, res, next) {
    // Handle both formats: "Bearer token" and just "token"
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
        return res.status(401).json({ 
            code: 'AUTH_MISSING',
            message: 'No token provided' 
        });
    }

    // Extract token (remove "Bearer " if present)
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check token version (for logout-all functionality)
        if (decoded.tokenVersion !== undefined) {
            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: { tokenVersion: true }
            });

            if (!user || user.tokenVersion !== decoded.tokenVersion) {
                return res.status(401).json({ 
                    code: 'AUTH_REVOKED',
                    message: 'Token has been revoked',
                    needsRefresh: true 
                });
            }
        }

        req.userId = decoded.id;
        next();
    } catch (err) {
        console.error('Auth error:', err.message);
        
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                code: 'AUTH_EXPIRED',
                message: 'Token expired',
                needsRefresh: true 
            });
        }
        
        res.status(403).json({ 
            code: 'AUTH_INVALID',
            message: 'Unauthorized' 
        });
    }
}

export default authMiddleware;