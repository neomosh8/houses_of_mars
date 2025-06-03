#!/bin/bash
echo "🚀 Starting complete deployment..."

# Navigate to project directory
cd /var/www/mars-game

# Stop all PM2 processes
echo "⏹️  Stopping PM2 processes..."
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true

# Wait for processes to stop
sleep 2

# Force clean git pull
echo "📥 Pulling latest code..."
git fetch --all
git reset --hard origin/main
git clean -fd

# Clean and reinstall dependencies
echo "📦 Reinstalling dependencies..."
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Restart application
echo "🔄 Starting application..."
pm2 start server.js --name "mars-game"

# Save PM2 configuration
pm2 save

# Show status
echo "✅ Application deployment complete!"
pm2 status

# Verify HTTPS is working
echo "🔒 Testing HTTPS configuration..."
sudo nginx -t
if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration is valid"
    sudo systemctl reload nginx
else
    echo "❌ Nginx configuration error - check manually"
fi

echo "📊 Recent logs:"
pm2 logs mars-game --lines 10

echo "🌐 Access your app at: https://housesofmars.com"
echo "📱 HTTP will redirect to HTTPS automatically"

# Test if site is responding
echo "🧪 Testing site response..."
curl -Is https://housesofmars.com | head -1