/*=====================================================
  GPIR WEBSITE
  Version 1.0
======================================================*/

document.addEventListener("DOMContentLoaded", () => {

    initializeWebsite();

});

function initializeWebsite(){

    console.log("GPIR Version 1.0 Loaded");

    initializeSmoothScroll();

    initializeBackToTop();

}

function initializeSmoothScroll(){

    document
        .querySelectorAll('a[href^="#"]')
        .forEach(anchor=>{

            anchor.addEventListener("click",function(e){

                const target=document.querySelector(this.getAttribute("href"));

                if(!target) return;

                e.preventDefault();

                target.scrollIntoView({

                    behavior:"smooth"

                });

            });

        });

}

function initializeBackToTop(){

    const button=document.querySelector(".back-top");

    if(!button) return;

    button.addEventListener("click",(e)=>{

        e.preventDefault();

        window.scrollTo({

            top:0,

            behavior:"smooth"

        });

    });

}

function initializeAnimations(){

}

function initializeCounters(){

}

function UtilityFunctions(){

}

