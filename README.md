**OriginX – Parametric Insurance for Food Delivery Workers**

Guidewire DEVTrails Hackathon 2026

**Team OriginX**

1. SHRESTHA VERDHAN
2. ARPIT SINGH
3. RAMYA PATHAK
4. ARYABRATA KUNDU

**1. Overview**

Food delivery partners working with platforms like Swiggy and Zomato depend on daily deliveries for their income. Since their work is completely outdoor-based, it is highly affected by environmental and external conditions.

Situations such as heavy rainfall, flooding, extreme heat, pollution, or sudden curfews can reduce their working hours and directly impact their earnings.

Currently, there is no straightforward system to help them recover this loss.

Our project proposes a parametric insurance platform that automatically compensates delivery workers when such disruptions occur.


**2. Problem Statement**

Gig delivery workers face unstable income due to factors beyond their control.

Common issues include:

. Heavy rain is stopping deliveries

. Flooded roads are making travel unsafe

. Extreme heat is reducing working hours

. Poor air quality is affecting outdoor work

. Local restrictions or curfews

These events can reduce a worker’s earnings by up to 20–30%.


3. Proposed Solution

We are building an AI-based parametric insurance system.

Instead of requiring workers to manually apply for claims, the system:

monitors external conditions continuously

detects disruption events automatically

triggers compensation instantly

Workers subscribe to a weekly insurance plan, and when conditions cross predefined thresholds, they receive payouts without any manual process.


4. Target Persona

Our focus is on food delivery partners in urban areas.

Example Scenario

A delivery partner working in Chennai experiences heavy rainfall during working hours. Due to waterlogged roads and reduced orders, the number of deliveries drops.

As a result, the worker loses part of their daily income.

With our system, when rainfall crosses a certain level, the platform automatically compensates the worker for the lost earning opportunity.



**5. Application Workflow**

The system works as follows:

1. The worker registers on the platform

2. The system calculates a weekly premium based on location risk

3. The worker selects a plan and activates coverage

4. The platform continuously monitors external conditions

5. When a disruption crosses a defined threshold, a claim is triggered automatically

6. The system verifies the worker’s activity and location

7. The payout is processed instantly
<img width="1536" height="1024" alt="Image Mar 18, 2026, 08_45_23 AM" src="https://github.com/user-attachments/assets/59a07843-4698-4d22-bdab-d7f1cae81bc3" />




**6. Weekly Premium Model**

The insurance model is designed every week, matching the earning pattern of gig workers.

Example Plans:

Plan	  Weekly Cost  	Coverage
Basic	     ₹25	        ₹300
Standard	 ₹40	        ₹500
Premium	   ₹60	        ₹700


The premium can vary depending on the risk level of the worker’s location.

**7. Parametric Triggers**

The system uses measurable conditions to trigger payouts.

Example Conditions: 

Event	               Trigger
Heavy Rain	     Rainfall > 50 mm
Extreme Heat	   Temperature > 42°C
High Pollution	    AQI > 300

When these conditions are met, compensation is automatically initiated.


**8. Platform Choice**

We are developing a web-based platform for this project.

Reason:

. Faster to develop within the hackathon timeline

. Easy to test and demonstrate

. Accessible on any device without installation

A mobile application can be considered for future development.


**9. AI / ML Integration**

AI is used in two main areas:

**Risk Assessment**

The system analyzes:

. historical weather data

. location-based risks

. frequency of disruptions

Based on this, it assigns a risk score to each area and adjusts premiums accordingly.

**Fraud Detection**

To prevent misuse, the system checks:

. location data consistency

. claim frequency patterns

. mismatch between actual events and user activity

This helps in identifying suspicious or invalid claims.


**10. Technology Stack**


**Frontend**
React.js

**Backend**
Node.js with Express

**Database**
MongoDB

**External APIs**
Weather API (rainfall, temperature)
Pollution API (AQI)

**AI / ML**
Python for risk analysis and anomaly detection

**Payments**
Razorpay (test mode)

**11. System Architecture**

![PHOTO-2026-03-16-12-43-16](https://github.com/user-attachments/assets/32ff6466-956e-4253-a8ec-9492e71bdb83)

This architecture shows how different components of the system interact, including user applications, backend services, AI modules, external APIs, and payment systems.


**12. Development Plan**

**Phase 1 – Ideation**

Research and problem understanding

Persona selection

System design

AI planning

Repository setup

**Phase 2 – Core Features**

User registration

Policy creation

Premium calculation

Disruption detection

Claim system

**Phase 3 – Enhancement**

Advanced fraud detection

Payment integration

Dashboard for users and admin

Predictive insights

**13. Additional Notes**

The system focuses only on income loss, not health or vehicle damage

The claim process is fully automated

The solution is scalable to other gig worker categories in the future

**14. Demo Video**

