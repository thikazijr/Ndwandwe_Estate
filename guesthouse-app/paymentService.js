// paymentService.js - Handles MTN MoMo and Bank Gateway integrations

const PaymentService = {
    // MTN MoMo Configuration (Sandbox by default)
    config: {
        baseUrl: 'https://sandbox.momodeveloper.mtn.com',
        subscriptionKey: 'YOUR_SUBSCRIPTION_KEY', // Should be in env/secure storage
        targetEnvironment: 'sandbox', // Use 'mtneswatini' for production
        currency: 'SZL'
    },

    /**
     * Initiates a Request to Pay via MTN MoMo
     * @param {string} phoneNumber - Guest phone number (e.g., 26876123456)
     * @param {number} amount - Amount to collect
     * @param {string} externalId - Reference (e.g., booking ID)
     */
    async requestToPayMoMo(phoneNumber, amount, externalId) {
        console.log(`Initiating MoMo payment for ${phoneNumber}: E${amount}`);
        
        // Simulation of network delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            // Step 1: Record the transaction as PENDING in our DB (Done via DataStore)
            const transactionId = await DataStore.addTransaction({
                booking_id: externalId,
                amount: amount,
                payment_method: 'MTN MoMo',
                provider_ref: 'MOMO-' + Math.random().toString(36).substring(7).toUpperCase(),
                status: 'Pending'
            });

            // Step 2: Return status to UI to show "Waiting for user..."
            return {
                success: true,
                status: 'PENDING',
                transactionId: transactionId,
                message: 'Payment request sent to phone. Please authorize on your device.',
                reference: externalId
            };
        } catch (error) {
            console.error('MoMo Payment Error:', error);
            // Return a more descriptive error if it's a database failure
            const detailedMessage = error.message || 'Network error or system failure';
            return { 
                success: false, 
                message: `MoMo Initiation Failed: ${detailedMessage}. Please ensure the 'transactions' table exists in your database.` 
            };
        }
    },

    /**
     * Simulates polling for MoMo status or receiving a callback
     */
    async waitForMoMoCompletion(transactionId) {
        // Simulate a 5-second wait for the user to type their PIN on their phone
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 90% chance of success for demo purposes
        const isSuccess = Math.random() > 0.1;
        const newStatus = isSuccess ? 'Success' : 'Failed';
        
        await DataStore.updateTransactionStatus(transactionId, newStatus);
        return { status: newStatus };
    },

    /**
     * Bank Gateway Simulation
     */
    async initiateBankPayment(amount, bookingId) {
        console.log(`Redirecting to Bank Gateway for E${amount}`);
        
        const transactionId = await DataStore.addTransaction({
            booking_id: bookingId,
            amount: amount,
            payment_method: 'Bank Transfer',
            provider_ref: 'BANK-' + Math.random().toString(36).substring(7).toUpperCase(),
            status: 'Pending'
        });

        // Simulate a redirect to a secure payment page
        return {
            success: true,
            transactionId: transactionId,
            redirectUrl: `https://secure-bank-gateway.com/pay?amount=${amount}&ref=${bookingId}&tid=${transactionId}`
        };
    },

    /**
     * Check transaction status
     */
    async checkTransactionStatus(transactionId) {
        // This would query our own DB or the provider API
        const status = await DataStore.getTransactionStatus(transactionId);
        return status;
    }
};

window.PaymentService = PaymentService;
