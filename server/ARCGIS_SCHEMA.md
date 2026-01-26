# Leave Tracker - ArcGIS Feature Layers Setup

## Overview
This document outlines the ArcGIS Feature Layers needed for the Leave Tracker application.

## Feature Layers Required

### 1. Employees Table
Stores employee information for authentication and profile data.

| Field | Type | Description |
|-------|------|-------------|
| `OBJECTID` | OID | Auto-generated |
| `EmployeeID` | String(50) | Unique employee identifier |
| `Username` | String(100) | Login username |
| `PasswordHash` | String(256) | Hashed password |
| `FirstName` | String(100) | First name |
| `LastName` | String(100) | Last name |
| `Email` | String(255) | Email address |
| `Department` | String(100) | Department name |
| `Role` | String(20) | staff / manager |
| `ManagerID` | String(50) | Manager's EmployeeID |
| `AnnualLeaveBalance` | Integer | Remaining annual leave days |
| `SickLeaveBalance` | Integer | Remaining sick leave days |
| `OtherLeaveBalance` | Integer | Remaining other leave days |
| `IsActive` | Integer | 1=Active, 0=Inactive |
| `CreatedDate` | Date | Account creation date |

---

### 2. LeaveRequests Table
Stores all leave request submissions and their status.

| Field | Type | Description |
|-------|------|-------------|
| `OBJECTID` | OID | Auto-generated |
| `RequestID` | String(50) | Unique request identifier |
| `EmployeeID` | String(50) | FK to Employees |
| `EmployeeName` | String(200) | Full name (denormalized) |
| `LeaveType` | String(20) | annual / sick / other |
| `StartDate` | Date | Leave start date |
| `EndDate` | Date | Leave end date |
| `DaysRequested` | Integer | Number of business days |
| `Reason` | String(500) | Employee's note |
| `Status` | String(20) | pending / approved / rejected |
| `ReviewedBy` | String(50) | Manager's EmployeeID |
| `ReviewedDate` | Date | When reviewed |
| `RejectionReason` | String(500) | Manager's rejection note |
| `SubmittedDate` | Date | When submitted |

---

### 3. Departments Table (Optional)
Stores department information.

| Field | Type | Description |
|-------|------|-------------|
| `OBJECTID` | OID | Auto-generated |
| `DepartmentID` | String(50) | Unique ID |
| `DepartmentName` | String(100) | Department name |
| `ManagerID` | String(50) | Department manager |

---

## Setup Script
Run `node scripts/setup-arcgis-layers.js` to create these layers.

## Environment Variables Required
```
ARCGIS_CLIENT_ID=your_client_id
ARCGIS_CLIENT_SECRET=your_client_secret
ARCGIS_ORG_URL=https://your-org.maps.arcgis.com
```
