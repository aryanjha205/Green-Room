import os
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from pymongo import MongoClient
from bson.objectid import ObjectId
import datetime
import json
from werkzeug.utils import secure_filename
from flask_mail import Mail, Message
import random
import cloudinary
import cloudinary.uploader

# Load environment variables
load_dotenv()

app = Flask(__name__, 
            static_folder='frontend/static', 
            template_folder='frontend/templates')
app.secret_key = os.getenv('SECRET_KEY', 'default-parrot-green-key')
CORS(app)

# MongoDB Setup
MONGO_URI = os.getenv('MONGO_URI')
if not MONGO_URI:
    print("WARNING: MONGO_URI is missing, the app will fail on database calls.")
    # For Vercel, we must have it to function
client = MongoClient(MONGO_URI if MONGO_URI else 'mongodb://localhost:27017')
db = client[os.getenv('DB_NAME', 'room_rental_db')]
listings_collection = db.listings

# Admin PIN
ADMIN_PIN = os.getenv('ADMIN_PIN', '70458')

# Image upload configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Mail Configuration
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS', 'True') == 'True'
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD', '').replace(' ', '')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_DEFAULT_SENDER')

mail = Mail(app)

# Cloudinary Configuration
cloudinary.config(
  cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"),
  api_key = os.getenv("CLOUDINARY_API_KEY"),
  api_secret = os.getenv("CLOUDINARY_API_SECRET"),
  secure = True
)

# MongoDB Collections
listings_collection = db.listings
users_collection = db.users
otp_collection = db.otps
notifications_collection = db.notifications

try:
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)
except Exception as e:
    print(f"Directory creation skipped (Read-only environment): {e}")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Support Functions
def get_distance(lat1, lon1, lat2, lon2):
    # Simplified haversine for sorting
    from math import cos, asin, sqrt, pi
    p = pi/180
    a = 0.5 - cos((lat2 - lat1) * p)/2 + cos(lat1 * p) * cos(lat2 * p) * (1 - cos((lon2 - lon1) * p)) / 2
    return 12742 * asin(sqrt(a)) # 2*R*asin...

# Routes
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/admin')
def admin_login_page():
    if session.get('is_admin'):
        return redirect(url_for('admin_dashboard'))
    return render_template('admin_login.html')

@app.route('/admin/dashboard')
def admin_dashboard():
    if not session.get('is_admin'):
        return redirect(url_for('admin_login_page'))
    return render_template('admin_dashboard.html')

@app.route('/list-room')
def list_room_page():
    return render_template('list_room.html')

# API Endpoints
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    pin = data.get('pin')
    if pin == ADMIN_PIN:
        session['is_admin'] = True
        return jsonify({"success": True, "message": "Login successful"})
    return jsonify({"success": False, "message": "Invalid PIN"}), 401

@app.route('/api/send-otp', methods=['POST'])
def send_otp():
    email = request.json.get('email')
    if not email:
        return jsonify({"success": False, "message": "Email is required"}), 400
    
    otp = str(random.randint(100000, 999999))
    otp_collection.update_one(
        {"email": email},
        {"$set": {"otp": otp, "created_at": datetime.datetime.utcnow()}},
        upsert=True
    )
    
    try:
        msg = Message("GreenRoom Login OTP", recipients=[email])
        msg.body = f"Your OTP for GreenRoom is: {otp}. It expires in 5 minutes."
        mail.send(msg)
        return jsonify({"success": True, "message": "OTP sent to your email"})
    except Exception as e:
        print(f"Mail Error: {e}")
        return jsonify({"success": False, "message": "Failed to send email"}), 500

@app.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    email = request.json.get('email')
    otp = request.json.get('otp')
    
    stored = otp_collection.find_one({"email": email})
    if not stored:
        return jsonify({"success": False, "message": "OTP not requested"}), 400
    
    if stored['otp'] == otp:
        # Check expiry (5 mins)
        if (datetime.datetime.utcnow() - stored['created_at']).total_seconds() > 300:
            return jsonify({"success": False, "message": "OTP expired"}), 400
            
        session['user_email'] = email
        users_collection.update_one({"email": email}, {"$set": {"last_login": datetime.datetime.utcnow()}}, upsert=True)
        return jsonify({"success": True})
    
    return jsonify({"success": False, "message": "Invalid OTP"}), 401

@app.route('/api/logout')
def logout():
    session.pop('is_admin', None)
    return redirect(url_for('home'))

@app.route('/profile')
def profile_page():
    return render_template('profile.html')

@app.route('/api/user/logout')
def user_logout():
    session.pop('user_email', None)
    return jsonify({"success": True})

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    email = session.get('user_email')
    if not email:
        return jsonify([])
    
    notifs = list(notifications_collection.find({"email": email}).sort("created_at", -1).limit(20))
    for n in notifs:
        n['_id'] = str(n['_id'])
    return jsonify(notifs)

@app.route('/api/notifications/read', methods=['POST'])
def mark_notifications_read():
    email = session.get('user_email')
    if not email:
        return jsonify({"success": False}), 401
    
    notifications_collection.update_many({"email": email}, {"$set": {"is_read": True}})
    return jsonify({"success": True})

@app.route('/api/user/me')
def get_me():
    email = session.get('user_email')
    return jsonify({
        "logged_in": bool(email),
        "email": email
    })

@app.route('/api/listings', methods=['GET'])
def get_listings():
    # Filters
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    radius = request.args.get('radius', type=float, default=50) # default 50km
    min_price = request.args.get('min_price', type=int)
    max_price = request.args.get('max_price', type=int)
    
    is_admin = session.get('is_admin', False)
    query = {}
    if not is_admin:
        query['is_approved'] = True  # Only show approved to public
    
    if min_price or max_price:
        query['price'] = {}
        if min_price: query['price']['$gte'] = min_price
        if max_price: query['price']['$lte'] = max_price

    listings = list(listings_collection.find(query))
    for l in listings:
        l['_id'] = str(l['_id'])
        if lat and lon:
            l['distance'] = get_distance(lat, lon, l['lat'], l['lon'])
        else:
            l['distance'] = 0

    # Sort if coordinates provided
    if lat and lon:
        listings.sort(key=lambda x: x['distance'])

    return jsonify(listings)

@app.route('/api/listings', methods=['POST'])
def add_listing():
    # Remove the hard requirement: if not session.get('is_admin'): return ...
    
    data = request.form.to_dict()
    # Handle numeric fields
    data['price'] = int(data.get('price', 0))
    data['deposit'] = int(data.get('deposit', 0))
    data['lat'] = float(data.get('lat', 0))
    data['lon'] = float(data.get('lon', 0))
    data['amenities'] = data.get('amenities', '').split(',')
    
    # Handle files (Upload to Cloudinary)
    images = []
    if 'images' in request.files:
        files = request.files.getlist('images')
        for file in files:
            if file and allowed_file(file.filename):
                try:
                    upload_result = cloudinary.uploader.upload(file, folder="greenroom_rentals")
                    images.append(upload_result['secure_url'])
                except Exception as e:
                    print(f"Cloudinary Error: {e}")
    
    # Status handling
    is_admin = session.get('is_admin', False)
    data['is_approved'] = True if is_admin else False
    data['email'] = session.get('user_email', 'admin@greenroom.com') if not is_admin else 'admin@greenroom.com'
    
    data['images'] = images
    data['created_at'] = datetime.datetime.utcnow()
    
    result = listings_collection.insert_one(data)
    return jsonify({"success": True, "id": str(result.inserted_id), "is_approved": data['is_approved']})

@app.route('/api/listings/<id>', methods=['PATCH'])
def approve_listing(id):
    if not session.get('is_admin'):
        return jsonify({"message": "Unauthorized"}), 403
    
    result = listings_collection.update_one(
        {"_id": ObjectId(id)},
        {"$set": {"is_approved": True}}
    )
    if result.modified_count:
        # Send Email Notification
        listing = listings_collection.find_one({"_id": ObjectId(id)})
        if listing and 'email' in listing:
            try:
                msg = Message("Property Listing Approved! | GreenRoom", recipients=[listing['email']])
                msg.body = f"Congratulations! Your property '{listing['title']}' has been approved and is now live on our platform."
                mail.send(msg)
            except: pass
        
        # In-App Notification
        notifications_collection.insert_one({
            "email": listing['email'],
            "title": "Listing Approved!",
            "message": f"Your property '{listing['title']}' is now live.",
            "created_at": datetime.datetime.utcnow(),
            "is_read": False
        })
        return jsonify({"success": True})
    return jsonify({"success": False}), 404

@app.route('/api/listings/<id>/reject', methods=['PATCH'])
def reject_listing(id):
    if not session.get('is_admin'):
        return jsonify({"message": "Unauthorized"}), 403
    
    listing = listings_collection.find_one({"_id": ObjectId(id)})
    if listing and 'email' in listing:
        try:
            msg = Message("Listing Update | GreenRoom", recipients=[listing['email']])
            msg.body = f"We're sorry, but your listing '{listing['title']}' was not approved at this time. Please ensure the photos and details are accurate."
            mail.send(msg)
        except: pass
    
    # In-App Notification
    if listing and 'email' in listing:
        notifications_collection.insert_one({
            "email": listing['email'],
            "title": "Listing Rejected",
            "message": f"Your property '{listing['title']}' was not approved.",
            "created_at": datetime.datetime.utcnow(),
            "is_read": False
        })
        
    listings_collection.delete_one({"_id": ObjectId(id)})
    return jsonify({"success": True})

@app.route('/api/listings/<id>', methods=['DELETE'])
def delete_listing(id):
    if not session.get('is_admin'):
        return jsonify({"message": "Unauthorized"}), 403
    
    result = listings_collection.delete_one({"_id": ObjectId(id)})
    if result.deleted_count:
        return jsonify({"success": True})
    return jsonify({"success": False}), 404

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# PWA Serviceworker
@app.route('/sw.js')
def sw():
    return app.send_static_file('js/sw.js')

if __name__ == '__main__':
    app.run(debug=True, port=int(os.getenv('PORT', 5000)))
