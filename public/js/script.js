function toggleLoginPopup() {
    const popup = document.getElementById('login-popup');
    popup.classList.toggle('hidden');
}
document.getElementById("menuToggle").addEventListener("click", function() {
    document.getElementById("menuList").classList.toggle("show");
})
const toggleBtn = document.getElementById("menuToggle");
const arrow = toggleBtn.querySelector(".arrow");

toggleBtn.addEventListener("click", function() {
    arrow.classList.toggle("rotate");
});