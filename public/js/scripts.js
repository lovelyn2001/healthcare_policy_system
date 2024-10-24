function acknowledge(policyId) {
    const userId = '<%= user.id %>'; // Make sure to pass the correct user ID

    fetch(`/healthcare/acknowledge/${policyId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }), // Send user ID as part of the request body
    })
    .then(response => {
        if (response.ok) {
            // Optionally, refresh the page or update the UI to show that the policy has been acknowledged
            location.reload(); // Reload the page to see the changes
        } else {
            alert('Failed to acknowledge policy');
        }
    })
    .catch(err => {
        console.error('Error acknowledging policy:', err);
    });
}



function editPolicy(policyId) {
    // Redirect to edit form
    window.location.href = `/admin/edit-policy/${policyId}`;
}

function deletePolicy(policyId) {
    fetch(`/admin/delete-policy/${policyId}`, {
        method: 'DELETE',
    }).then(res => window.location.reload());
}


