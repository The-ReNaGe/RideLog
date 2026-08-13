-- Schéma d'une instance RideLog ANTÉRIEURE au dépôt public : elle a été
-- montée par l'ancien init_db(), dont les ALTER TABLE ont laissé trois
-- colonnes de facture (invoice_filename, invoice_path, invoice_mime_type)
-- que le modèle actuel ne déclare plus. C'est la divergence réelle que la
-- migration 006 vient réparer, et que le test de parité verrouille.
--
-- DDL uniquement — relevé sur une instance de test, sans aucune donnée.
-- NE PAS MODIFIER : c'est un instantané d'une base réellement en service.

CREATE TABLE fuel_logs (
	id INTEGER NOT NULL, 
	vehicle_id INTEGER NOT NULL, 
	fill_date DATETIME NOT NULL, 
	mileage_at_fill INTEGER NOT NULL, 
	liters FLOAT, 
	total_cost FLOAT NOT NULL, 
	price_per_liter FLOAT, 
	station VARCHAR(255), 
	notes TEXT, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(vehicle_id) REFERENCES vehicles (id)
);
CREATE TABLE invitations (
	id INTEGER NOT NULL, 
	token VARCHAR(64) NOT NULL, 
	created_by INTEGER NOT NULL, 
	used_by INTEGER, 
	expires_at DATETIME NOT NULL, 
	created_at DATETIME, 
	used_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(created_by) REFERENCES users (id), 
	FOREIGN KEY(used_by) REFERENCES users (id)
);
CREATE TABLE maintenance_invoices (
	id INTEGER NOT NULL, 
	maintenance_id INTEGER NOT NULL, 
	filename VARCHAR(255) NOT NULL, 
	file_path VARCHAR(500) NOT NULL, 
	mime_type VARCHAR(100) NOT NULL, 
	file_size INTEGER NOT NULL, 
	uploaded_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(maintenance_id) REFERENCES maintenances (id)
);
CREATE TABLE maintenances (
	id INTEGER NOT NULL, 
	vehicle_id INTEGER NOT NULL, 
	intervention_type VARCHAR(200) NOT NULL, 
	execution_date DATETIME NOT NULL, 
	mileage_at_intervention INTEGER NOT NULL, 
	cost_paid FLOAT, 
	notes TEXT, 
	maintenance_category VARCHAR(50) NOT NULL, 
	other_description VARCHAR(200), 
	sub_interventions JSON, 
	created_at DATETIME, invoice_filename VARCHAR(255), invoice_path VARCHAR(500), invoice_mime_type VARCHAR(100), 
	PRIMARY KEY (id), 
	FOREIGN KEY(vehicle_id) REFERENCES vehicles (id)
);
CREATE TABLE notification_logs (
	id INTEGER NOT NULL, 
	vehicle_id INTEGER NOT NULL, 
	intervention_key VARCHAR(200) NOT NULL, 
	notification_type VARCHAR(50) NOT NULL, 
	sent_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(vehicle_id) REFERENCES vehicles (id)
);
CREATE TABLE users (
	id INTEGER NOT NULL, 
	username VARCHAR(50) NOT NULL, 
	display_name VARCHAR(100) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	is_admin BOOLEAN, 
	is_integration_account BOOLEAN, 
	created_at DATETIME, password_changed_at DATETIME, must_change_password BOOLEAN DEFAULT 0, password_reset_requested_at DATETIME, 
	PRIMARY KEY (id)
);
CREATE TABLE vehicle_estimates (
	id INTEGER NOT NULL, 
	brand VARCHAR(100) NOT NULL, 
	model VARCHAR(100) NOT NULL, 
	year INTEGER NOT NULL, 
	estimate_min FLOAT NOT NULL, 
	estimate_max FLOAT NOT NULL, 
	mileage_bracket_min INTEGER, 
	mileage_bracket_max INTEGER, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id)
);
CREATE TABLE vehicle_maintenance_overrides (
	id INTEGER NOT NULL, 
	vehicle_id INTEGER NOT NULL, 
	intervention_key VARCHAR(200) NOT NULL, 
	km_interval INTEGER, 
	months_interval INTEGER, 
	is_km_disabled BOOLEAN NOT NULL, 
	is_months_disabled BOOLEAN NOT NULL, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(vehicle_id) REFERENCES vehicles (id)
);
CREATE TABLE vehicles (
	id INTEGER NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	vehicle_type VARCHAR(50) NOT NULL, 
	brand VARCHAR(100) NOT NULL, 
	model VARCHAR(100) NOT NULL, 
	year INTEGER NOT NULL, 
	registration_date DATETIME, 
	motorization VARCHAR(50) NOT NULL, 
	displacement INTEGER, 
	range_category VARCHAR(50) NOT NULL, 
	current_mileage INTEGER NOT NULL, 
	purchase_price FLOAT, 
	service_interval_km INTEGER, 
	service_interval_months INTEGER, 
	photo_path VARCHAR(500), 
	notes TEXT, 
	created_at DATETIME, 
	updated_at DATETIME, 
	user_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE webhooks (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	url VARCHAR(500) NOT NULL, 
	webhook_type VARCHAR(50), 
	token_secret VARCHAR(64) NOT NULL, 
	is_active BOOLEAN, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE INDEX ix_fuel_logs_id ON fuel_logs (id);
CREATE INDEX ix_fuel_logs_vehicle_id ON fuel_logs (vehicle_id);
CREATE INDEX ix_invitations_id ON invitations (id);
CREATE UNIQUE INDEX ix_invitations_token ON invitations (token);
CREATE INDEX ix_maintenance_invoices_id ON maintenance_invoices (id);
CREATE INDEX ix_maintenances_id ON maintenances (id);
CREATE INDEX ix_notification_logs_id ON notification_logs (id);
CREATE INDEX ix_notification_logs_vehicle_id ON notification_logs (vehicle_id);
CREATE INDEX ix_users_id ON users (id);
CREATE UNIQUE INDEX ix_users_username ON users (username);
CREATE INDEX ix_vehicle_estimates_brand ON vehicle_estimates (brand);
CREATE INDEX ix_vehicle_estimates_id ON vehicle_estimates (id);
CREATE INDEX ix_vehicle_maintenance_overrides_id ON vehicle_maintenance_overrides (id);
CREATE INDEX ix_vehicle_maintenance_overrides_vehicle_id ON vehicle_maintenance_overrides (vehicle_id);
CREATE INDEX ix_vehicles_id ON vehicles (id);
CREATE INDEX ix_vehicles_user_id ON vehicles (user_id);
CREATE INDEX ix_webhooks_id ON webhooks (id);
CREATE UNIQUE INDEX ix_webhooks_token_secret ON webhooks (token_secret);
CREATE INDEX ix_webhooks_user_id ON webhooks (user_id);
